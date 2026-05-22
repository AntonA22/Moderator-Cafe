const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';
const AUTH_TOKEN_KEY = 'moderator_cafe_auth_token';
const AUTH_USER_KEY = 'moderator_cafe_auth_user';
const AUTH_SESSION_HINT_KEY = 'moderator_cafe_has_session';
const addressCache = new Map();
const pendingAddressRequests = new Map();
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
let csrfPromise = null;

const endpoint = (path) => `${API_BASE_URL}${path}`;

function safeRemove(key) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.removeItem(key);
  window.sessionStorage.removeItem(key);
}

function clearLegacyAuthData() {
  safeRemove(AUTH_TOKEN_KEY);
  safeRemove(AUTH_USER_KEY);
}

function clearStoredAuthData() {
  clearLegacyAuthData();
  safeRemove(AUTH_SESSION_HINT_KEY);
}

function markAuthSession() {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(AUTH_SESSION_HINT_KEY, '1');
  window.sessionStorage.setItem(AUTH_SESSION_HINT_KEY, '1');
}

function hasAuthSessionHint() {
  if (typeof window === 'undefined') {
    return false;
  }

  return (
    window.localStorage.getItem(AUTH_SESSION_HINT_KEY) === '1' ||
    window.sessionStorage.getItem(AUTH_SESSION_HINT_KEY) === '1'
  );
}

function getCookie(name) {
  if (typeof document === 'undefined') {
    return '';
  }

  return document.cookie
    .split('; ')
    .find((row) => row.startsWith(`${name}=`))
    ?.split('=')
    .slice(1)
    .join('=') || '';
}

function shouldUseCsrf(path, method) {
  if (SAFE_METHODS.has(method)) {
    return false;
  }

  return path.startsWith('/api/moderator') || path.startsWith('/api/admin');
}

async function ensureCsrfToken() {
  if (!csrfPromise) {
    csrfPromise = fetch(endpoint('/sanctum/csrf-cookie'), {
      method: 'GET',
      credentials: 'include',
      headers: {
        Accept: 'application/json'
      }
    }).finally(() => {
      csrfPromise = null;
    });
  }

  const response = await csrfPromise;
  if (!response.ok) {
    throw new Error(`Не удалось получить CSRF-токен: HTTP ${response.status}`);
  }
}

export function clearAuthSession() {
  clearStoredAuthData();
}

export function getStoredAuthSession() {
  clearLegacyAuthData();
  return { token: hasAuthSessionHint() ? 'cookie-session' : '', user: null };
}

async function request(path, options = {}) {
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  const method = String(options.method || 'GET').toUpperCase();

  if (shouldUseCsrf(path, method)) {
    await ensureCsrfToken();
  }

  const csrfToken = shouldUseCsrf(path, method) ? decodeURIComponent(getCookie('XSRF-TOKEN')) : '';
  const headers = {
    Accept: 'application/json',
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...(csrfToken ? { 'X-XSRF-TOKEN': csrfToken } : {}),
    ...(options.headers || {})
  };

  const response = await fetch(endpoint(path), {
    ...options,
    credentials: 'include',
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
  const body = await request('/api/moderator/login', {
    method: 'POST',
    body: JSON.stringify({ login, password })
  });

  const user = body?.user || body?.data?.user || null;

  if (!user) {
    throw new Error('Сервер не вернул пользователя.');
  }

  clearLegacyAuthData();
  markAuthSession();
  return { user };
}

export async function logoutUser() {
  try {
    await request('/api/moderator/logout', { method: 'POST' });
  } catch {
    // Cookie could already be expired; local logout should still continue.
  } finally {
    clearAuthSession();
  }
}

export async function fetchCurrentUser() {
  const body = await request('/api/moderator/me');
  return body?.data || body?.user || body;
}

export async function fetchProducts() {
  let body;
  try {
    body = await request('/api/admin/products');
  } catch (error) {
    if (error?.status && ![404, 405].includes(error.status)) {
      throw error;
    }
    body = await request('/api/products');
  }

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

export async function fetchCakeDesigns() {
  const body = await request('/api/admin/cake-designs');
  return body?.data || [];
}

export async function createCakeDesign(payload) {
  const body = await request('/api/admin/cake-designs', {
    method: 'POST',
    body: JSON.stringify(payload)
  });

  return body?.data || body;
}

async function updateCakeDesignWithMethod(designId, payload, method) {
  const body = await request(`/api/admin/cake-designs/${designId}`, {
    method,
    body: JSON.stringify(payload)
  });

  return body?.data || body;
}

export async function updateCakeDesign(designId, payload) {
  try {
    return await updateCakeDesignWithMethod(designId, payload, 'PUT');
  } catch (error) {
    if (error?.status && ![404, 405].includes(error.status)) {
      throw error;
    }
    return updateCakeDesignWithMethod(designId, payload, 'PATCH');
  }
}

export async function deleteCakeDesign(designId) {
  return request(`/api/admin/cake-designs/${designId}`, {
    method: 'DELETE'
  });
}

export async function deleteStoragePhoto(photoUrl) {
  const body = await request('/api/admin/storage/photo', {
    method: 'DELETE',
    body: JSON.stringify({ url: photoUrl })
  });

  return body?.data || body;
}

export async function createProduct(payload) {
  const body = await request('/api/admin/products', {
    method: 'POST',
    body: JSON.stringify(payload)
  });

  return body?.data || body;
}

export async function fetchOrders(filters = {}) {
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
  const params = new URLSearchParams();

  if (filters.dateFrom) {
    params.set('date_from', filters.dateFrom);
  }
  if (filters.dateTo) {
    params.set('date_to', filters.dateTo);
  }
  if (filters.deliveryMode && filters.deliveryMode !== 'all') {
    params.set('delivery_mode', filters.deliveryMode);
  }
  params.set('per_page', '100');

  const queryString = params.toString();
  const adminPath = `/api/admin/orders${queryString ? `?${queryString}` : ''}`;
  const fallbackPath = `/api/orders${queryString ? `?${queryString}` : ''}`;

  try {
    const body = await request(adminPath);
    return pickOrders(body);
  } catch (error) {
    // Fallback for legacy non-admin route.
    if (error?.status && ![404, 405].includes(error.status)) {
      throw error;
    }
    const body = await request(fallbackPath);
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

export async function deleteProduct(productId) {
  return request(`/api/admin/products/${productId}`, {
    method: 'DELETE'
  });
}

export async function updateOrder(orderId, payload) {
  const statusPayload = { status: payload?.status };

  const body = await request(`/api/admin/orders/${orderId}/status`, {
    method: 'PATCH',
    body: JSON.stringify(statusPayload)
  });

  return body?.data || body;
}

export { API_BASE_URL };
