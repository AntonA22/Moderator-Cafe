const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';
const AUTH_TOKEN_KEY = 'moderator_cafe_auth_token';
const AUTH_USER_KEY = 'moderator_cafe_auth_user';
const addressCache = new Map();
const pendingAddressRequests = new Map();

const endpoint = (path) => `${API_BASE_URL}${path}`;

function safeRead(key) {
  if (typeof window === 'undefined') {
    return '';
  }

  return window.localStorage.getItem(key) || '';
}

function safeWrite(key, value) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(key, value);
}

function safeRemove(key) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.removeItem(key);
}

function getAuthToken() {
  return safeRead(AUTH_TOKEN_KEY);
}

function saveAuthSession(token, user) {
  safeWrite(AUTH_TOKEN_KEY, token);
  safeWrite(AUTH_USER_KEY, JSON.stringify(user || null));
}

export function clearAuthSession() {
  safeRemove(AUTH_TOKEN_KEY);
  safeRemove(AUTH_USER_KEY);
}

export function getStoredAuthSession() {
  const token = getAuthToken();
  const userRaw = safeRead(AUTH_USER_KEY);
  let user = null;

  if (userRaw) {
    try {
      user = JSON.parse(userRaw);
    } catch {
      user = null;
    }
  }

  return { token, user };
}

async function request(path, options = {}) {
  const token = getAuthToken();
  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {})
  };

  const response = await fetch(endpoint(path), {
    ...options,
    headers
  });

  const text = await response.text();
  let body = null;

  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }

  if (!response.ok) {
    const message = body?.message || body?.error || `HTTP ${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  return body;
}

export async function loginUser(login, password) {
  const body = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ login, password })
  });

  const token = body?.token || body?.data?.token;
  const user = body?.user || body?.data?.user || null;

  if (!token) {
    throw new Error('Сервер не вернул токен авторизации.');
  }

  saveAuthSession(token, user);
  return { token, user };
}

export async function fetchProducts() {
  const body = await request('/api/products');
  const items = body?.data || [];

  return items.map((product) => {
    let photos = [];

    if (Array.isArray(product?.photos)) {
      photos = product.photos;
    } else if (typeof product?.photos === 'string' && product.photos.trim()) {
      try {
        const parsed = JSON.parse(product.photos);
        if (Array.isArray(parsed)) {
          photos = parsed;
        }
      } catch {
        photos = product.photos
          .split(/\r?\n|,/)
          .map((item) => item.trim())
          .filter(Boolean);
      }
    }

    return {
      ...product,
      photos
    };
  });
}

export async function fetchOrders() {
  const pickOrders = (payload) => {
    if (Array.isArray(payload)) {
      return payload;
    }
    if (Array.isArray(payload?.data?.data)) {
      return payload.data.data;
    }
    if (Array.isArray(payload?.data)) {
      return payload.data;
    }
    return [];
  };

  try {
    const body = await request('/api/admin/orders');
    return pickOrders(body);
  } catch (error) {
    // Fallback for legacy non-admin route.
    if (error?.status && ![404, 405].includes(error.status)) {
      throw error;
    }
    const body = await request('/api/orders');
    return pickOrders(body);
  }
}

export async function fetchAddressById(addressId) {
  if (!addressId) {
    return null;
  }

  if (addressCache.has(addressId)) {
    return addressCache.get(addressId);
  }

  if (pendingAddressRequests.has(addressId)) {
    return pendingAddressRequests.get(addressId);
  }

  const pickAddress = (payload) => {
    if (!payload) {
      return null;
    }

    if (payload?.data && !Array.isArray(payload.data)) {
      return payload.data;
    }

    return payload;
  };

  const promise = (async () => {
    try {
      const body = await request(`/api/admin/addresses/${addressId}`);
      const result = pickAddress(body);
      addressCache.set(addressId, result);
      return result;
    } catch (error) {
      // Fallback for legacy non-admin route.
      if (error?.status && ![404, 405].includes(error.status)) {
        throw error;
      }
      const body = await request(`/api/addresses/${addressId}`);
      const result = pickAddress(body);
      addressCache.set(addressId, result);
      return result;
    } finally {
      pendingAddressRequests.delete(addressId);
    }
  })();

  pendingAddressRequests.set(addressId, promise);
  return promise;
}

async function updateWithMethod(productId, payload, method) {
  return request(`/api/admin/products/${productId}`, {
    method,
    body: JSON.stringify(payload)
  });
}

export async function updateProduct(productId, payload) {
  try {
    await updateWithMethod(productId, payload, 'PUT');
  } catch (error) {
    // Many Laravel APIs use PATCH for updates; retry here for compatibility.
    if (error?.status && ![404, 405].includes(error.status)) {
      throw error;
    }
    await updateWithMethod(productId, payload, 'PATCH');
  }
}

export async function updateOrder(orderId, payload) {
  const statusPayload = { status: payload?.status };

  return request(`/api/admin/orders/${orderId}/status`, {
    method: 'PATCH',
    body: JSON.stringify(statusPayload)
  });
}

export { API_BASE_URL };
