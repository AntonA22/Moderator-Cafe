const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL || 'https://ibembkohihvrhrgefequ.supabase.co';
const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_V9m3Z20nTBNv1he4ZKTtAw_C4RdTNiQ';
const SUPABASE_BUCKET = import.meta.env.VITE_SUPABASE_BUCKET || 'cafe';

function buildFilePath(productId, fileName) {
  return `product${productId}/${fileName}`;
}

function buildCakeDesignFilePath(slug, fileName) {
  const safeSlug = sanitizePathSegment(slug) || 'cake-design';
  return `cake-designs/${safeSlug}/${fileName}`;
}

function splitFileName(fileName) {
  const normalizedName = String(fileName || '').trim();
  if (!normalizedName) {
    return { baseName: 'photo', extension: '' };
  }

  const lastDotIndex = normalizedName.lastIndexOf('.');
  if (lastDotIndex <= 0 || lastDotIndex === normalizedName.length - 1) {
    return { baseName: normalizedName, extension: '' };
  }

  return {
    baseName: normalizedName.slice(0, lastDotIndex),
    extension: normalizedName.slice(lastDotIndex + 1)
  };
}

function sanitizePathSegment(value) {
  const normalized = String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-._]+|[-._]+$/g, '')
    .toLowerCase();

  return normalized || '';
}

function buildSafeUploadFileName(fileName) {
  const { baseName, extension } = splitFileName(fileName);
  const safeBaseName = sanitizePathSegment(baseName) || 'photo';
  const safeExtension = sanitizePathSegment(extension).replace(/\.+/g, '');
  const uniqueSuffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  if (!safeExtension) {
    return `${safeBaseName}-${uniqueSuffix}`;
  }

  return `${safeBaseName}-${uniqueSuffix}.${safeExtension}`;
}

function encodePath(path) {
  return path
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');
}

function buildPublicUrl(path) {
  return `${SUPABASE_URL}/storage/v1/object/public/${encodeURIComponent(SUPABASE_BUCKET)}/${encodePath(path)}`;
}

function createStorageError(response, errorBody) {
  const message = errorBody?.message || errorBody?.error || `HTTP ${response.status}`;
  const error = new Error(message);
  error.status = response.status;
  error.code = errorBody?.code || '';
  return error;
}

function isNotFoundError(error) {
  const message = String(error?.message || '').toLowerCase();
  return error?.status === 404 || message.includes('not found') || message.includes('notfound');
}

function isPermissionError(error) {
  return error?.status === 401 || error?.status === 403;
}

function authHeaders(extra = {}) {
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    ...extra
  };
}

function extractPathInfoFromPublicUrl(photoUrl) {
  if (!photoUrl) {
    return null;
  }

  try {
    const parsedUrl = new URL(String(photoUrl));
    const supabaseBaseUrl = new URL(SUPABASE_URL);
    if (parsedUrl.origin !== supabaseBaseUrl.origin) {
      return null;
    }

    const encodedBucket = encodeURIComponent(SUPABASE_BUCKET);
    const marker = `/storage/v1/object/public/${encodedBucket}/`;
    if (!parsedUrl.pathname.startsWith(marker)) {
      return null;
    }

    const encodedPath = parsedUrl.pathname.slice(marker.length);
    if (!encodedPath) {
      return null;
    }

    const decodedPath = encodedPath
      .split('/')
      .map((part) => decodeURIComponent(part))
      .join('/');

    return { encodedPath, decodedPath };
  } catch {
    return null;
  }
}

async function uploadFile(path, file) {
  const uploadUrl = `${SUPABASE_URL}/storage/v1/object/${encodeURIComponent(SUPABASE_BUCKET)}/${encodePath(path)}`;
  const response = await fetch(uploadUrl, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': file.type || 'application/octet-stream' }),
    body: file
  });

  if (!response.ok) {
    let errorBody = null;
    try {
      errorBody = await response.json();
    } catch {
      errorBody = null;
    }
    throw createStorageError(response, errorBody);
  }
}

async function deleteFile(path) {
  const deleteUrl = `${SUPABASE_URL}/storage/v1/object/${encodeURIComponent(SUPABASE_BUCKET)}/${encodePath(path)}`;
  const response = await fetch(deleteUrl, {
    method: 'DELETE',
    headers: authHeaders()
  });

  if (!response.ok) {
    let errorBody = null;
    try {
      errorBody = await response.json();
    } catch {
      errorBody = null;
    }
    throw createStorageError(response, errorBody);
  }
}

async function removeFiles(paths) {
  const body = JSON.stringify({ prefixes: paths });
  const response = await fetch(`${SUPABASE_URL}/storage/v1/object/${encodeURIComponent(SUPABASE_BUCKET)}`, {
    method: 'DELETE',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body
  });

  if (!response.ok) {
    let errorBody = null;
    try {
      errorBody = await response.json();
    } catch {
      errorBody = null;
    }
    throw createStorageError(response, errorBody);
  }
}

function uniquePaths(paths) {
  return Array.from(new Set(paths.filter(Boolean)));
}

function fileNameFromPath(path) {
  if (!path) {
    return '';
  }

  const parts = String(path).split('/').filter(Boolean);
  return parts[parts.length - 1] || '';
}

export async function uploadProductPhotos(productId, files) {
  const urls = [];

  for (const file of files) {
    const path = buildFilePath(productId, buildSafeUploadFileName(file.name));
    try {
      await uploadFile(path, file);
    } catch (error) {
      throw new Error(`Не удалось загрузить "${file.name}": ${error.message}`);
    }
    urls.push(buildPublicUrl(path));
  }

  return urls;
}

export async function uploadCakeDesignPhoto(slug, file) {
  const path = buildCakeDesignFilePath(slug, buildSafeUploadFileName(file.name));
  try {
    await uploadFile(path, file);
  } catch (error) {
    throw new Error(`Не удалось загрузить "${file.name}": ${error.message}`);
  }

  return buildPublicUrl(path);
}

export async function deleteCakeDesignPhotoByUrl(photoUrl) {
  const pathInfo = extractPathInfoFromPublicUrl(photoUrl);
  if (!pathInfo) {
    return { deleted: false, skipped: true, missing: false, permissionDenied: false };
  }

  try {
    await deleteFile(pathInfo.decodedPath);
    return { deleted: true, skipped: false, missing: false, permissionDenied: false };
  } catch (error) {
    if (isPermissionError(error)) {
      return { deleted: false, skipped: false, missing: false, permissionDenied: true };
    }
    if (isNotFoundError(error)) {
      return { deleted: false, skipped: false, missing: true, permissionDenied: false };
    }
    throw error;
  }
}

export async function deleteProductPhotoByUrl(photoUrl, productId) {
  const pathInfo = extractPathInfoFromPublicUrl(photoUrl);
  if (!pathInfo) {
    return { deleted: false, skipped: true, missing: false, permissionDenied: false };
  }

  const guessedPath = fileNameFromPath(pathInfo.decodedPath)
    ? buildFilePath(productId, fileNameFromPath(pathInfo.decodedPath))
    : '';
  const candidatePaths = uniquePaths([pathInfo.decodedPath, guessedPath]);

  let permissionError = null;
  try {
    for (const path of candidatePaths) {
      try {
        await deleteFile(path);
        return { deleted: true, skipped: false, missing: false, permissionDenied: false };
      } catch (error) {
        if (isNotFoundError(error)) {
          continue;
        }
        if (isPermissionError(error)) {
          permissionError = error;
          break;
        }
        throw error;
      }
    }

    if (permissionError) {
      return { deleted: false, skipped: false, missing: false, permissionDenied: true };
    }

    try {
      await removeFiles(candidatePaths);
      return { deleted: true, skipped: false, missing: false, permissionDenied: false };
    } catch (error) {
      if (isPermissionError(error)) {
        return { deleted: false, skipped: false, missing: false, permissionDenied: true };
      }
      if (isNotFoundError(error)) {
        return { deleted: false, skipped: false, missing: true, permissionDenied: false };
      }
      throw error;
    }
  } catch (error) {
    if (isPermissionError(error)) {
      return { deleted: false, skipped: false, missing: false, permissionDenied: true };
    }
    throw error;
  }
}
