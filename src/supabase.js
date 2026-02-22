const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL || 'https://ibembkohihvrhrgefequ.supabase.co';
const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_V9m3Z20nTBNv1he4ZKTtAw_C4RdTNiQ';
const SUPABASE_BUCKET = import.meta.env.VITE_SUPABASE_BUCKET || 'cafe';

function buildFilePath(productId, fileName) {
  return `product${productId}/${fileName}`;
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

async function uploadFile(path, file) {
  const uploadUrl = `${SUPABASE_URL}/storage/v1/object/${encodeURIComponent(SUPABASE_BUCKET)}/${encodePath(path)}`;
  const response = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': file.type || 'application/octet-stream'
    },
    body: file
  });

  if (!response.ok) {
    let errorBody = null;
    try {
      errorBody = await response.json();
    } catch {
      errorBody = null;
    }
    const message = errorBody?.message || `HTTP ${response.status}`;
    throw new Error(message);
  }
}

export async function uploadProductPhotos(productId, files) {
  const urls = [];

  for (const file of files) {
    const path = buildFilePath(productId, file.name);
    try {
      await uploadFile(path, file);
    } catch (error) {
      throw new Error(`Не удалось загрузить "${file.name}": ${error.message}`);
    }
    urls.push(buildPublicUrl(path));
  }

  return urls;
}
