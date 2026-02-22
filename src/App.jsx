import { useEffect, useMemo, useState } from 'react';
import {
  clearAuthSession,
  fetchProducts,
  getStoredAuthSession,
  loginUser,
  updateProduct
} from './api';
import LoginScreen from './LoginScreen';
import OrdersScreen from './OrdersScreen';
import ProfileScreen from './ProfileScreen';
import { deleteProductPhotoByUrl, uploadProductPhotos } from './supabase';

const NUMBER_FIELDS = ['price', 'weight', 'calories', 'proteins', 'fats', 'carbohydrates'];
const SCREEN_MENU = 'menu';
const SCREEN_ORDERS = 'orders';
const SCREEN_PROFILE = 'profile';
const ROUTE_LOGIN = '/login';

function screenFromPath(pathname) {
  if (pathname === '/orders') {
    return SCREEN_ORDERS;
  }
  if (pathname === '/profile') {
    return SCREEN_PROFILE;
  }
  return SCREEN_MENU;
}

function pathFromScreen(screen) {
  if (screen === SCREEN_ORDERS) {
    return '/orders';
  }
  if (screen === SCREEN_PROFILE) {
    return '/profile';
  }
  return '/menu';
}

function toNumber(value) {
  if (value === '' || value === null || value === undefined) {
    return 0;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeProduct(product) {
  const photos = normalizePhotos(product?.photos);
  const normalized = {
    ...product,
    name: product?.name || '',
    category: product?.category || '',
    description: product?.description || '',
    photos,
    available: Boolean(product?.available)
  };

  NUMBER_FIELDS.forEach((field) => {
    normalized[field] = toNumber(product?.[field]);
  });

  return normalized;
}

function buildPayload(draft) {
  const photos = normalizePhotos(draft?.photosText ?? draft?.photos);
  const { photosText, ...rest } = draft;

  return {
    ...rest,
    photos,
    ...Object.fromEntries(NUMBER_FIELDS.map((field) => [field, toNumber(draft[field])]))
  };
}

function normalizePhotos(photosValue) {
  if (!photosValue) {
    return [];
  }

  if (Array.isArray(photosValue)) {
    return photosValue.map((item) => String(item).trim()).filter(Boolean);
  }

  const asText = String(photosValue).trim();
  if (!asText) {
    return [];
  }

  if (asText.startsWith('[')) {
    try {
      const parsed = JSON.parse(asText);
      if (Array.isArray(parsed)) {
        return parsed.map((item) => String(item).trim()).filter(Boolean);
      }
    } catch {
      // Keep text fallback below.
    }
  }

  return asText
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function createDraftFromProduct(product) {
  const photos = normalizePhotos(product?.photos);

  return {
    ...product,
    photos,
    photosText: photos.join('\n')
  };
}

function mergePhotoFiles(existingFiles, incomingFiles) {
  const map = new Map();

  existingFiles.forEach((file) => {
    map.set(`${file.name}_${file.size}_${file.lastModified}`, file);
  });

  incomingFiles.forEach((file) => {
    map.set(`${file.name}_${file.size}_${file.lastModified}`, file);
  });

  return Array.from(map.values());
}

function removeFirstPhotoMatch(photos, targetUrl) {
  const photoIndex = photos.indexOf(targetUrl);
  if (photoIndex < 0) {
    return photos;
  }

  return photos.filter((_, index) => index !== photoIndex);
}

function isAdminUser(user) {
  return user?.is_staff === true || user?.is_staff === 1;
}

function readInitialSession() {
  const session = getStoredAuthSession();
  if (session.token && !isAdminUser(session.user)) {
    clearAuthSession();
    return { token: '', user: null, forbidden: true };
  }

  return {
    token: session.token,
    user: session.user,
    forbidden: false
  };
}

function readInitialScreen() {
  if (typeof window === 'undefined') {
    return SCREEN_MENU;
  }

  return screenFromPath(window.location.pathname);
}

function App() {
  const initialSession = useMemo(() => readInitialSession(), []);
  const [accountUser, setAccountUser] = useState(() => initialSession.user);
  const [isLoggedIn, setIsLoggedIn] = useState(() => Boolean(initialSession.token));
  const [loginError, setLoginError] = useState(() =>
    initialSession.forbidden ? 'Ошибка 403: доступ только для администратора.' : ''
  );
  const [loggingIn, setLoggingIn] = useState(false);
  const [activeScreen, setActiveScreen] = useState(() => readInitialScreen());
  const [products, setProducts] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [draft, setDraft] = useState(null);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('Все');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [photoFiles, setPhotoFiles] = useState([]);
  const [previewPhotoUrl, setPreviewPhotoUrl] = useState('');

  const selectedProduct = useMemo(
    () => products.find((product) => product.id === selectedId) || null,
    [products, selectedId]
  );

  const categories = useMemo(() => {
    const unique = new Set(products.map((product) => product.category).filter(Boolean));
    return ['Все', ...Array.from(unique).sort()];
  }, [products]);

  const filteredProducts = useMemo(() => {
    const needle = search.toLowerCase().trim();

    return products.filter((product) => {
      const byCategory = category === 'Все' || product.category === category;
      const byText =
        !needle ||
        product.name.toLowerCase().includes(needle) ||
        product.description.toLowerCase().includes(needle);

      return byCategory && byText;
    });
  }, [products, search, category]);

  const isDirty = useMemo(() => {
    if (!selectedProduct || !draft) {
      return false;
    }

    return JSON.stringify(buildPayload(selectedProduct)) !== JSON.stringify(buildPayload(draft));
  }, [selectedProduct, draft]);

  const hasPendingPhotos = photoFiles.length > 0;
  const canSave = isDirty || hasPendingPhotos;
  const accountLabel = accountUser?.username || accountUser?.email || 'неизвестно';
  const draftPhotoUrls = useMemo(
    () => normalizePhotos(draft?.photosText ?? draft?.photos),
    [draft?.photosText, draft?.photos]
  );

  async function handleLoginSubmit({ login, password }) {
    setLoginError('');

    if (!login || !password.trim()) {
      setLoginError('Введите логин и пароль.');
      return;
    }

    setLoggingIn(true);
    try {
      const session = await loginUser(login, password);

      if (!isAdminUser(session.user)) {
        clearAuthSession();
        setAccountUser(null);
        setIsLoggedIn(false);
        setLoginError('Ошибка 403: доступ только для администратора.');
        return;
      }

      setAccountUser(session.user);
      setIsLoggedIn(true);
      setActiveScreen(SCREEN_MENU);
      setError('');
      setStatus('');
    } catch (loginRequestError) {
      setLoginError(`Ошибка входа: ${loginRequestError.message}`);
    } finally {
      setLoggingIn(false);
    }
  }

  function handleLogout() {
    clearAuthSession();
    setIsLoggedIn(false);
    setAccountUser(null);
    setLoginError('');
    setActiveScreen(SCREEN_MENU);
    setProducts([]);
    setSelectedId(null);
    setDraft(null);
    setPhotoFiles([]);
    setError('');
    setStatus('');
    setLoading(false);
  }

  async function loadProducts({ keepSelection = true } = {}) {
    setLoading(true);
    setError('');

    try {
      const data = await fetchProducts();
      const normalized = data.map(normalizeProduct);

      setProducts(normalized);

      if (!keepSelection || !normalized.some((item) => item.id === selectedId)) {
        setSelectedId(normalized[0]?.id ?? null);
      }
    } catch (requestError) {
      setError(`Не удалось загрузить продукты: ${requestError.message}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!isLoggedIn) {
      return;
    }

    loadProducts({ keepSelection: false });
  }, [isLoggedIn]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    if (!isLoggedIn) {
      if (window.location.pathname !== ROUTE_LOGIN) {
        window.history.replaceState({}, '', ROUTE_LOGIN);
      }
      return;
    }

    const targetPath = pathFromScreen(activeScreen);
    if (window.location.pathname !== targetPath) {
      window.history.replaceState({}, '', targetPath);
    }
  }, [isLoggedIn, activeScreen]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    function handlePopState() {
      if (!isLoggedIn) {
        return;
      }
      setActiveScreen(screenFromPath(window.location.pathname));
    }

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [isLoggedIn]);

  useEffect(() => {
    if (!selectedProduct) {
      setDraft(null);
      setPhotoFiles([]);
      setPreviewPhotoUrl('');
      return;
    }

    setDraft(createDraftFromProduct(selectedProduct));
    setPhotoFiles([]);
    setPreviewPhotoUrl('');
  }, [selectedProduct]);

  useEffect(() => {
    if (!previewPhotoUrl) {
      return;
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        setPreviewPhotoUrl('');
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [previewPhotoUrl]);

  function handleFieldChange(field, value) {
    setDraft((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        [field]: NUMBER_FIELDS.includes(field) ? value : value
      };
    });
  }

  async function handleDeletePhoto(photoIndex) {
    if (!draft) {
      return;
    }

    const currentUrls = normalizePhotos(draft.photosText ?? draft.photos);
    const targetUrl = currentUrls[photoIndex];
    if (!targetUrl) {
      return;
    }

    setSaving(true);
    setError('');
    setStatus('');

    try {
      const deleteResult = await deleteProductPhotoByUrl(targetUrl, draft.id);

      setDraft((current) => {
        if (!current) {
          return current;
        }

        const nextUrls = removeFirstPhotoMatch(normalizePhotos(current.photosText ?? current.photos), targetUrl);
        return {
          ...current,
          photos: nextUrls,
          photosText: nextUrls.join('\n')
        };
      });

      setStatus(
        deleteResult.deleted
          ? 'Фото удалено из Supabase и из продукта.'
          : deleteResult.permissionDenied
            ? 'Фото удалено из продукта. В Supabase не удалено: нет прав (для этого клиента нужна policy delete/select для роли anon, либо удаление через backend с service key).'
          : deleteResult.missing
            ? 'Фото удалено из продукта. Файл в Supabase уже отсутствовал.'
            : 'Фото удалено из продукта. Удаление из Supabase пропущено (внешний URL).'
      );
    } catch (deleteError) {
      setError(`Ошибка удаления фото: ${deleteError.message}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleSave() {
    if (!draft) {
      return;
    }

    setSaving(true);
    setError('');
    setStatus('');

    try {
      let nextDraft = draft;
      const filesToUpload = photoFiles;

      if (filesToUpload.length > 0) {
        const uploadedUrls = await uploadProductPhotos(draft.id, filesToUpload);
        const mergedPhotos = [
          ...normalizePhotos(draft.photosText ?? draft.photos),
          ...uploadedUrls
        ].filter(Boolean);
        nextDraft = { ...draft, photos: mergedPhotos, photosText: mergedPhotos.join('\n') };
        setDraft(nextDraft);
        setPhotoFiles([]);
      }

      const payload = buildPayload(nextDraft);
      await updateProduct(payload.id, payload);

      setProducts((current) =>
        current.map((product) => (product.id === payload.id ? normalizeProduct(payload) : product))
      );

      const uploadLabel =
        filesToUpload.length > 0 ? `Фото загружены (${filesToUpload.length}). ` : '';
      setStatus(`${uploadLabel}Сохранено: ${new Date().toLocaleString('ru-RU')}`);
    } catch (saveError) {
      setError(`Ошибка сохранения: ${saveError.message}`);
    } finally {
      setSaving(false);
    }
  }

  if (!isLoggedIn) {
    return (
      <LoginScreen
        defaultLogin={accountUser?.username || accountUser?.email || ''}
        loading={loggingIn}
        error={loginError}
        onSubmit={handleLoginSubmit}
      />
    );
  }

  return (
    <div className="page-bg">
      <div className="grain" />
      <main className="layout">
        <header className="topbar">
          <div>
            <p className="eyebrow">Панель модератора</p>
            <h1>
              {activeScreen === SCREEN_MENU ? 'Редактирование меню' : null}
              {activeScreen === SCREEN_ORDERS ? 'Редактирование заказов' : null}
              {activeScreen === SCREEN_PROFILE ? 'Профиль' : null}
            </h1>
          </div>
          <div className="topbar-actions">
            <span className="api-note">Пользователь: {accountLabel}</span>
            <button className="ghost" onClick={handleLogout} disabled={saving}>
              Выйти
            </button>
          </div>
        </header>

        <nav className="top-menu">
          <button
            className={`top-menu-btn ${activeScreen === SCREEN_MENU ? 'active' : ''}`}
            onClick={() => setActiveScreen(SCREEN_MENU)}
          >
            Редактирование меню
          </button>
          <button
            className={`top-menu-btn ${activeScreen === SCREEN_ORDERS ? 'active' : ''}`}
            onClick={() => setActiveScreen(SCREEN_ORDERS)}
          >
            Редактирование заказов
          </button>
          <button
            className={`top-menu-btn ${activeScreen === SCREEN_PROFILE ? 'active' : ''}`}
            onClick={() => setActiveScreen(SCREEN_PROFILE)}
          >
            Профиль
          </button>
        </nav>

        {activeScreen === SCREEN_MENU ? (
          <>
            {error ? <p className="message error">{error}</p> : null}
            {status ? <p className="message success">{status}</p> : null}

            <section className="content">
              <aside className="panel list-panel">
                <div className="controls">
                  <button className="ghost" onClick={() => loadProducts()} disabled={loading}>
                    Обновить список
                  </button>

                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Поиск по названию и описанию"
                  />
                  <select value={category} onChange={(event) => setCategory(event.target.value)}>
                    {categories.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="list-scroll">
                  {loading ? <p className="subtle">Загрузка...</p> : null}
                  {!loading && filteredProducts.length === 0 ? (
                    <p className="subtle">Ничего не найдено</p>
                  ) : null}

                  {filteredProducts.map((product) => {
                    const coverPhoto = normalizePhotos(product.photos)[0] || '';

                    return (
                      <button
                        key={product.id}
                        className={`product-card ${product.id === selectedId ? 'active' : ''}`}
                        onClick={() => setSelectedId(product.id)}
                      >
                        <div className="product-card-main">
                          {coverPhoto ? (
                            <img className="product-thumb" src={coverPhoto} alt={product.name} loading="lazy" />
                          ) : (
                            <div className="product-thumb product-thumb-empty">Фото</div>
                          )}
                          <div>
                            <strong>{product.name}</strong>
                            <p>{product.category}</p>
                          </div>
                        </div>
                        <div className="chip-line">
                          <span className="chip">{product.price} ₽</span>
                          <span className={`chip ${product.available ? 'ok' : 'off'}`}>
                            {product.available ? 'В наличии' : 'Нет'}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </aside>

              <section className="panel editor-panel">
                {!draft ? (
                  <p className="subtle">Выберите продукт из списка слева</p>
                ) : (
                  <>
                    <div className="editor-head">
                      <h2>{draft.name || 'Без названия'}</h2>
                      <span>ID: {draft.id}</span>
                    </div>

                    <div className="form-grid">
                      <label>
                        Название
                        <input
                          value={draft.name}
                          onChange={(event) => handleFieldChange('name', event.target.value)}
                        />
                      </label>

                      <label>
                        Категория
                        <input
                          value={draft.category}
                          onChange={(event) => handleFieldChange('category', event.target.value)}
                        />
                      </label>

                      <label className="full">
                        Описание
                        <textarea
                          rows="3"
                          value={draft.description}
                          onChange={(event) => handleFieldChange('description', event.target.value)}
                        />
                      </label>

                      <label>
                        Цена (₽)
                        <input
                          type="number"
                          value={draft.price}
                          onChange={(event) => handleFieldChange('price', event.target.value)}
                        />
                      </label>

                      <label>
                        Вес (г)
                        <input
                          type="number"
                          value={draft.weight}
                          onChange={(event) => handleFieldChange('weight', event.target.value)}
                        />
                      </label>

                      <label>
                        Калории
                        <input
                          type="number"
                          value={draft.calories}
                          onChange={(event) => handleFieldChange('calories', event.target.value)}
                        />
                      </label>

                      <label>
                        Белки
                        <input
                          type="number"
                          step="0.1"
                          value={draft.proteins}
                          onChange={(event) => handleFieldChange('proteins', event.target.value)}
                        />
                      </label>

                      <label>
                        Жиры
                        <input
                          type="number"
                          step="0.1"
                          value={draft.fats}
                          onChange={(event) => handleFieldChange('fats', event.target.value)}
                        />
                      </label>

                      <label>
                        Углеводы
                        <input
                          type="number"
                          step="0.1"
                          value={draft.carbohydrates}
                          onChange={(event) => handleFieldChange('carbohydrates', event.target.value)}
                        />
                      </label>

                      <div className="full">
                        <div className="photo-block-head">
                          <p className="subtle">Картинок: {draftPhotoUrls.length}</p>
                        </div>

                        {draftPhotoUrls.length === 0 ? (
                          <p className="subtle">Фото не добавлены</p>
                        ) : (
                          <div className="photo-medium-grid">
                            {draftPhotoUrls.map((url, index) => (
                              <div key={`${url}-${index}`} className="photo-medium-item">
                                <button
                                  type="button"
                                  className="photo-open-btn"
                                  onClick={() => setPreviewPhotoUrl(url)}
                                >
                                  <img src={url} alt={`${draft.name || 'Продукт'} ${index + 1}`} loading="lazy" />
                                </button>
                                <button
                                  type="button"
                                  className="photo-delete-btn"
                                  onClick={() => handleDeletePhoto(index)}
                                  disabled={saving}
                                >
                                  Удалить
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <label className="full">
                        Добавить фото (файлы в Supabase)
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          onChange={(event) => {
                            const incomingFiles = Array.from(event.target.files || []);
                            setPhotoFiles((current) => mergePhotoFiles(current, incomingFiles));
                            event.target.value = '';
                          }}
                        />
                        <span className="subtle">
                          Файлы загрузятся в Supabase при нажатии кнопки сохранения.
                        </span>
                        {photoFiles.length === 0 ? (
                          <span className="subtle">Файлы пока не выбраны.</span>
                        ) : (
                          <span className="subtle">Выбрано файлов: {photoFiles.length}</span>
                        )}
                      </label>

                      <label className="checkbox">
                        <input
                          type="checkbox"
                          checked={draft.available}
                          onChange={(event) => handleFieldChange('available', event.target.checked)}
                        />
                        Доступен для заказа
                      </label>
                    </div>

                    <div className="editor-actions">
                      <button
                        className="ghost"
                        onClick={() => {
                          setDraft(createDraftFromProduct(selectedProduct));
                          setPhotoFiles([]);
                        }}
                        disabled={(!isDirty && !hasPendingPhotos) || saving}
                      >
                        Отменить
                      </button>
                      <button className="primary save-action" onClick={handleSave} disabled={!canSave || saving}>
                        {saving
                          ? 'Сохраняем...'
                          : hasPendingPhotos
                            ? 'Загрузить фото и сохранить'
                            : 'Сохранить изменения'}
                      </button>
                    </div>
                  </>
                )}
              </section>
            </section>
          </>
        ) : null}

        {activeScreen === SCREEN_ORDERS ? <OrdersScreen /> : null}
        {activeScreen === SCREEN_PROFILE ? <ProfileScreen user={accountUser} /> : null}
      </main>
      {previewPhotoUrl ? (
        <div className="photo-modal" onClick={() => setPreviewPhotoUrl('')}>
          <div className="photo-modal-body" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="photo-modal-close" onClick={() => setPreviewPhotoUrl('')}>
              Закрыть
            </button>
            <img src={previewPhotoUrl} alt="Превью фото" />
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default App;
