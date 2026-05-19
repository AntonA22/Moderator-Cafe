import { useEffect, useMemo, useRef, useState } from 'react';
import {
  createCakeDesign,
  deleteCakeDesign,
  fetchCakeDesigns,
  updateCakeDesign
} from './api';
import { deleteCakeDesignPhotoByUrl, uploadCakeDesignPhoto } from './supabase';

const NUMBER_FIELDS = ['price', 'weight_grams', 'calories_per_100g', 'sort_order'];
const FIXED_WEIGHT_OPTIONS = [
  { title: '0,8 кг', grams: 800 },
  { title: '1,2 кг', grams: 1200 },
  { title: '1,5 кг', grams: 1500 }
];

function toNumber(value) {
  if (value === '' || value === null || value === undefined) {
    return 0;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeNumberInputValue(value) {
  const text = String(value);

  if (text === '') {
    return '';
  }

  if (text.startsWith('-')) {
    return `-${normalizeNumberInputValue(text.slice(1))}`;
  }

  return text.replace(/^0+(?=\d)/, '');
}

function formatWeightTitle(grams) {
  const value = toNumber(grams);
  if (!value) {
    return '';
  }

  if (value % 1000 === 0) {
    return `${value / 1000} кг`;
  }

  return `${Number((value / 1000).toFixed(1)).toString().replace('.', ',')} кг`;
}

function kgInputValue(grams) {
  if (grams === '' || grams === null || grams === undefined) {
    return '';
  }

  const value = toNumber(grams);
  return value > 0 ? Number((value / 1000).toFixed(2)) : '';
}

function gramsFromKgInput(value) {
  if (value === '' || value === null || value === undefined) {
    return '';
  }

  const parsed = Number(String(value).replace(',', '.'));
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 1000) : '';
}

function normalizeWeightOptions(weights, fallbackGrams = 0) {
  const source = Array.isArray(weights) ? weights : [];
  const map = new Map();

  source.forEach((weight) => {
    const grams = toNumber(weight?.grams);
    if (grams > 0) {
      map.set(grams, {
        title: String(weight?.title || '').trim() || formatWeightTitle(grams),
        grams
      });
    }
  });

  if (map.size === 0) {
    FIXED_WEIGHT_OPTIONS.forEach((weight) => map.set(weight.grams, weight));
  }

  return Array.from(map.values()).sort((left, right) => left.grams - right.grams);
}

function editableWeightOptions(weights, fallbackGrams = 0) {
  const source = Array.isArray(weights) && weights.length > 0 ? weights : normalizeWeightOptions(weights, fallbackGrams);
  return source.map((weight, index) => ({
    title: String(weight?.title || FIXED_WEIGHT_OPTIONS[index]?.title || ''),
    grams: weight?.grams ?? FIXED_WEIGHT_OPTIONS[index]?.grams ?? ''
  }));
}

function normalizeDesign(design) {
  const photos = normalizePhotos(design?.photos ?? design?.image_url ?? design?.imageURLString);
  const photoPreviews = normalizePhotos(design?.photo_previews ?? design?.galleryImageURLStrings ?? design?.imageURLString);
  const normalized = {
    ...design,
    slug: design?.slug || design?.id || '',
    name: design?.name || '',
    subtitle: design?.subtitle || '',
    filling: design?.filling || '',
    accent: design?.accent || '',
    composition: design?.composition || '',
    storage: design?.storage || '0...+6 °C, 72 ч',
    recommended_text: design?.recommended_text || design?.recommendedText || '',
    photos,
    photo_previews: photoPreviews,
    image_url: photos[0] || '',
    image_preview_url: photoPreviews[0] || photos[0] || '',
    available_weights: normalizeWeightOptions(design?.availableWeights ?? design?.available_weights, design?.weight_grams),
    available: design?.available !== false
  };

  NUMBER_FIELDS.forEach((field) => {
    normalized[field] = toNumber(design?.[field]);
  });

  if (!normalized.weight_grams && Array.isArray(design?.availableWeights)) {
    normalized.weight_grams = toNumber(design.availableWeights[0]?.grams);
  }
  normalized.available_weights = normalizeWeightOptions(
    design?.availableWeights ?? design?.available_weights,
    normalized.weight_grams
  );
  if (!normalized.calories_per_100g && design?.kcalPer100g) {
    normalized.calories_per_100g = toNumber(design.kcalPer100g);
  }

  return normalized;
}

function normalizePhotos(value) {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean).slice(0, 3);
  }

  const asText = String(value).trim();
  return asText ? [asText] : [];
}

function createEmptyDesignDraft() {
  return {
    slug: '',
    name: '',
    subtitle: '',
    filling: '',
    accent: '',
    composition: '',
    storage: '0...+6 °C, 72 ч',
    weight_grams: 1200,
    price: 0,
    calories_per_100g: 0,
    recommended_text: '',
    available: true,
    sort_order: 0,
    photos: [],
    photo_previews: [],
    image_url: '',
    image_preview_url: '',
    available_weights: FIXED_WEIGHT_OPTIONS
  };
}

function buildPayload(draft) {
  const { id, image_preview_url, photo_previews, imageURLString, image_path, created_at, updated_at, ...rest } = draft;
  const slug = String(rest.slug || '').trim();
  if (!slug) {
    delete rest.slug;
  } else {
    rest.slug = slug;
  }

  return {
    ...rest,
    photos: normalizePhotos(draft.photos),
    image_url: normalizePhotos(draft.photos)[0] || null,
    available_weights: normalizeWeightOptions(draft.available_weights, draft.weight_grams),
    ...Object.fromEntries(NUMBER_FIELDS.map((field) => [field, toNumber(draft[field])])),
    available: Boolean(draft.available)
  };
}

function photoFileKey(file) {
  return `${file.name}_${file.size}_${file.lastModified}`;
}

function CakeDesignForm({
  mode,
  draft,
  imageFiles,
  saving,
  deleting = false,
  canSubmit,
  onFieldChange,
  onImageFilesSelected,
  onRemoveImageFile,
  onClearImageFiles,
  onRemovePhoto,
  onReset,
  onSubmit,
  onDelete
}) {
  const imageInputRef = useRef(null);
  const busy = saving || deleting;
  const pendingImagePreviews = useMemo(
    () => imageFiles.map((file) => URL.createObjectURL(file)),
    [imageFiles]
  );
  const imagePreviews = useMemo(() => {
    const existing = normalizePhotos(draft.photo_previews).length > 0
      ? normalizePhotos(draft.photo_previews)
      : normalizePhotos(draft.photos);
    return [...existing, ...pendingImagePreviews].slice(0, 3);
  }, [draft.photo_previews, draft.photos, pendingImagePreviews]);

  useEffect(() => {
    return () => pendingImagePreviews.forEach((url) => URL.revokeObjectURL(url));
  }, [pendingImagePreviews]);

  function updateWeightOption(index, value) {
    const nextWeights = editableWeightOptions(draft.available_weights, draft.weight_grams);
    const grams = gramsFromKgInput(value);
    nextWeights[index] = {
      ...nextWeights[index],
      grams,
      title: grams > 0 ? formatWeightTitle(grams) : ''
    };

    onFieldChange('available_weights', nextWeights);
  }

  function addWeightOption() {
    const nextWeights = editableWeightOptions(draft.available_weights, draft.weight_grams);
    const largest = Math.max(...nextWeights.map((weight) => toNumber(weight.grams)), 1000);
    const grams = largest + 500;
    onFieldChange('available_weights', [
      ...nextWeights,
      { title: formatWeightTitle(grams), grams }
    ]);
  }

  function removeWeightOption(index) {
    const nextWeights = editableWeightOptions(draft.available_weights, draft.weight_grams)
      .filter((_, weightIndex) => weightIndex !== index);
    onFieldChange('available_weights', nextWeights);
  }

  const weightOptions = editableWeightOptions(draft.available_weights, draft.weight_grams);

  return (
    <section className="panel editor-panel">
      <div className="editor-head">
        <h2>{mode === 'create' ? 'Новый торт с надписью' : draft.name || 'Без названия'}</h2>
        {mode === 'edit' ? <span>ID: {draft.id}</span> : null}
      </div>

      <div className="form-grid">
        <label>
          Название
          <input value={draft.name} onChange={(event) => onFieldChange('name', event.target.value)} />
        </label>

        <label className="full">
          Короткое описание
          <textarea
            rows="2"
            value={draft.subtitle}
            onChange={(event) => onFieldChange('subtitle', event.target.value)}
          />
        </label>

        <label className="full">
          Начинка
          <textarea
            rows="2"
            value={draft.filling}
            onChange={(event) => onFieldChange('filling', event.target.value)}
          />
        </label>

        <label className="full">
          Акцент / декор
          <textarea
            rows="2"
            value={draft.accent}
            onChange={(event) => onFieldChange('accent', event.target.value)}
          />
        </label>

        <label className="full">
          Состав
          <textarea
            rows="3"
            value={draft.composition}
            onChange={(event) => onFieldChange('composition', event.target.value)}
          />
        </label>

        <label>
          Цена за 100 г (₽)
          <input type="number" value={draft.price} onChange={(event) => onFieldChange('price', event.target.value)} />
        </label>

        <div className="full weight-options-editor">
          <div className="weight-options-head">
            <div>
              <span>Доступные веса для заказа</span>
              <p className="subtle">Покупатель увидит эти варианты в приложении.</p>
            </div>
            <button type="button" className="ghost" onClick={addWeightOption} disabled={busy}>
              Добавить вес
            </button>
          </div>

          <div className="weight-options-list">
            {weightOptions.map((weight, index) => (
              <div className="weight-option-row" key={`${weight.grams}-${index}`}>
                <label>
                  Вес, кг
                  <input
                    type="number"
                    min="0.1"
                    step="0.1"
                    value={kgInputValue(weight.grams)}
                    onChange={(event) => updateWeightOption(index, event.target.value)}
                  />
                </label>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => removeWeightOption(index)}
                  disabled={busy || weightOptions.length <= 1}
                >
                  Убрать
                </button>
              </div>
            ))}
          </div>
        </div>

        <label>
          Калории / 100 г
          <input
            type="number"
            value={draft.calories_per_100g}
            onChange={(event) => onFieldChange('calories_per_100g', event.target.value)}
          />
        </label>

        <label>
          Хранение
          <input value={draft.storage} onChange={(event) => onFieldChange('storage', event.target.value)} />
        </label>

        <label>
          Рекомендация по надписи
          <input
            value={draft.recommended_text}
            onChange={(event) => onFieldChange('recommended_text', event.target.value)}
          />
        </label>

        <div className="full cake-image-editor">
          <div>
            <span>Фото дизайна</span>
            <p className="subtle">До 3 фото: основное фото, пример надписи, начинка/разрез.</p>
          </div>
          {imagePreviews.length > 0 ? (
            <div className="cake-design-photo-grid">
              {imagePreviews.map((url, index) => (
                <div className="cake-design-photo-item" key={`${url}-${index}`}>
                  <img className="cake-design-preview" src={url} alt={`${draft.name || 'Торт'} ${index + 1}`} />
                  {index < normalizePhotos(draft.photos).length ? (
                    <button type="button" className="photo-delete-btn" onClick={() => onRemovePhoto(index)} disabled={busy}>
                      Удалить
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <div className="cake-design-preview cake-design-preview-empty">Фото</div>
          )}
          <input
            ref={imageInputRef}
            className="file-input-hidden"
            type="file"
            accept="image/*"
            multiple
            onChange={(event) => {
              const files = Array.from(event.target.files || []);
              onImageFilesSelected(files);
              event.target.value = '';
            }}
          />
          <div className="chip-line">
            <button type="button" className="ghost" onClick={() => imageInputRef.current?.click()} disabled={busy}>
              Выбрать фото
            </button>
            {imageFiles.length > 0 ? (
              <button type="button" className="ghost" onClick={onClearImageFiles} disabled={busy}>
                Очистить выбранные
              </button>
            ) : null}
          </div>
          {imageFiles.length > 0 ? (
            <div className="pending-photo-list">
              {imageFiles.map((file, index) => (
                <div key={photoFileKey(file)} className="pending-photo-item">
                  <span className="pending-photo-name" title={file.name}>
                    {file.name}
                  </span>
                  <button
                    type="button"
                    className="ghost pending-photo-remove"
                    onClick={() => onRemoveImageFile(index)}
                    disabled={busy}
                  >
                    Убрать
                  </button>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <label className="checkbox">
          <input
            type="checkbox"
            checked={draft.available}
            onChange={(event) => onFieldChange('available', event.target.checked)}
          />
          Доступен
        </label>
      </div>

      <div className="editor-actions">
        {mode === 'edit' ? (
          <button className="danger" onClick={onDelete} disabled={busy}>
            {deleting ? 'Удаляем...' : 'Удалить'}
          </button>
        ) : null}
        <button className="ghost" onClick={onReset} disabled={!canSubmit || busy}>
          Отменить
        </button>
        <button className="primary save-action" onClick={onSubmit} disabled={!canSubmit || busy}>
          {saving ? 'Сохраняем...' : mode === 'create' ? 'Создать' : 'Сохранить'}
        </button>
      </div>
    </section>
  );
}

function CakeDesignsScreen() {
  const [designs, setDesigns] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [draft, setDraft] = useState(null);
  const [createDraft, setCreateDraft] = useState(() => createEmptyDesignDraft());
  const [imageFiles, setImageFiles] = useState([]);
  const [createImageFiles, setCreateImageFiles] = useState([]);
  const [search, setSearch] = useState('');
  const [mode, setMode] = useState('edit');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');

  const selectedDesign = useMemo(
    () => designs.find((design) => design.id === selectedId) || null,
    [designs, selectedId]
  );

  const filteredDesigns = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) {
      return designs;
    }

    return designs.filter((design) =>
      [design.name, design.slug, design.subtitle, design.composition]
        .join(' ')
        .toLowerCase()
        .includes(needle)
    );
  }, [designs, search]);

  const isDirty = useMemo(() => {
    if (!selectedDesign || !draft) {
      return false;
    }

    return JSON.stringify(buildPayload(selectedDesign)) !== JSON.stringify(buildPayload(draft));
  }, [selectedDesign, draft]);

  const isCreateDirty = useMemo(
    () => JSON.stringify(buildPayload(createDraft)) !== JSON.stringify(buildPayload(createEmptyDesignDraft())),
    [createDraft]
  );

  const canSave = isDirty || imageFiles.length > 0;
  const canCreate = isCreateDirty || createImageFiles.length > 0;

  async function loadDesigns({ keepSelection = true } = {}) {
    setLoading(true);
    setError('');

    try {
      const data = await fetchCakeDesigns();
      const normalized = data.map(normalizeDesign);
      setDesigns(normalized);

      if (!keepSelection || !normalized.some((item) => item.id === selectedId)) {
        setSelectedId(normalized[0]?.id ?? null);
      }
    } catch (requestError) {
      setError(`Не удалось загрузить торты с надписью: ${requestError.message}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDesigns({ keepSelection: false });
  }, []);

  useEffect(() => {
    if (!selectedDesign) {
      setDraft(null);
      setImageFiles([]);
      return;
    }

    setDraft(normalizeDesign(selectedDesign));
    setImageFiles([]);
  }, [selectedDesign]);

  function handleFieldChange(field, value) {
    setDraft((current) => (
      current
        ? { ...current, [field]: NUMBER_FIELDS.includes(field) ? normalizeNumberInputValue(value) : value }
        : current
    ));
  }

  function handleCreateFieldChange(field, value) {
    setCreateDraft((current) => ({
      ...current,
      [field]: NUMBER_FIELDS.includes(field) ? normalizeNumberInputValue(value) : value
    }));
  }

  function mergeImageFiles(existingFiles, incomingFiles, existingPhotoCount = 0) {
    const map = new Map();
    existingFiles.forEach((file) => map.set(photoFileKey(file), file));
    incomingFiles.forEach((file) => map.set(photoFileKey(file), file));
    return Array.from(map.values()).slice(0, Math.max(0, 3 - existingPhotoCount));
  }

  function removeImageFileByIndex(files, targetIndex) {
    return files.filter((_, index) => index !== targetIndex);
  }

  async function uploadPendingPhotos(slug, files, existingPhotos) {
    const uploadedUrls = [];
    const slotsLeft = Math.max(0, 3 - existingPhotos.length);
    const filesToUpload = files.slice(0, slotsLeft);

    for (const file of filesToUpload) {
      uploadedUrls.push(await uploadCakeDesignPhoto(slug, file));
    }

    return [...existingPhotos, ...uploadedUrls].slice(0, 3);
  }

  function handleRemoveDraftPhoto(photoIndex) {
    setDraft((current) => {
      if (!current) {
        return current;
      }

      const photos = normalizePhotos(current.photos);
      const photoPreviews = normalizePhotos(current.photo_previews);
      return {
        ...current,
        photos: photos.filter((_, index) => index !== photoIndex),
        photo_previews: photoPreviews.filter((_, index) => index !== photoIndex),
      };
    });
  }

  function handleRemoveCreatePhoto(photoIndex) {
    setCreateDraft((current) => {
      const photos = normalizePhotos(current.photos);
      const photoPreviews = normalizePhotos(current.photo_previews);
      return {
        ...current,
        photos: photos.filter((_, index) => index !== photoIndex),
        photo_previews: photoPreviews.filter((_, index) => index !== photoIndex),
      };
    });
  }

  async function handleSave() {
    if (!draft) {
      return;
    }

    setSaving(true);
    setError('');
    setStatus('');

    try {
      const oldPhotos = normalizePhotos(selectedDesign?.photos);
      const draftPhotos = normalizePhotos(draft.photos);
      let nextDesign = normalizeDesign(await updateCakeDesign(draft.id, buildPayload(draft)));
      if (imageFiles.length > 0) {
        const photos = await uploadPendingPhotos(nextDesign.slug || nextDesign.id, imageFiles, normalizePhotos(nextDesign.photos));
        nextDesign = normalizeDesign(await updateCakeDesign(nextDesign.id, { photos }));
      }
      const keptPhotos = normalizePhotos(nextDesign.photos);
      const removedPhotos = oldPhotos.filter((photo) => !draftPhotos.includes(photo) && !keptPhotos.includes(photo));
      for (const photo of removedPhotos) {
        await deleteCakeDesignPhotoByUrl(photo);
      }

      setDesigns((current) => current.map((item) => (item.id === nextDesign.id ? nextDesign : item)));
      setDraft(nextDesign);
      setImageFiles([]);
      setStatus(`Сохранено: ${new Date().toLocaleString('ru-RU')}`);
    } catch (saveError) {
      setError(`Ошибка сохранения: ${saveError.message}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleCreate() {
    setSaving(true);
    setError('');
    setStatus('');

    try {
      let createdDesign = normalizeDesign(await createCakeDesign(buildPayload(createDraft)));
      if (createImageFiles.length > 0) {
        const photos = await uploadPendingPhotos(createdDesign.slug || createdDesign.id, createImageFiles, normalizePhotos(createdDesign.photos));
        createdDesign = normalizeDesign(await updateCakeDesign(createdDesign.id, { photos }));
      }

      setDesigns((current) => [createdDesign, ...current]);
      setSelectedId(createdDesign.id);
      setCreateDraft(createEmptyDesignDraft());
      setCreateImageFiles([]);
      setMode('edit');
      setStatus(`Торт "${createdDesign.name || createdDesign.slug}" создан.`);
    } catch (createError) {
      setError(`Ошибка создания: ${createError.message}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!draft) {
      return;
    }

    const confirmed = window.confirm(`Удалить торт "${draft.name || draft.slug}"?`);
    if (!confirmed) {
      return;
    }

    setDeleting(true);
    setError('');
    setStatus('');

    try {
      for (const photo of normalizePhotos(draft.photos)) {
        await deleteCakeDesignPhotoByUrl(photo);
      }
      await deleteCakeDesign(draft.id);
      setDesigns((current) => {
        const remaining = current.filter((item) => item.id !== draft.id);
        setSelectedId(remaining[0]?.id ?? null);
        return remaining;
      });
      setDraft(null);
      setImageFiles([]);
      setStatus(`Торт "${draft.name || draft.slug}" удален.`);
    } catch (deleteError) {
      setError(`Ошибка удаления: ${deleteError.message}`);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      {error ? <p className="message error">{error}</p> : null}
      {status ? <p className="message success">{status}</p> : null}

      <section className="content">
        <aside className="panel list-panel">
          <div className="controls">
            <button className="ghost" onClick={() => loadDesigns()} disabled={loading}>
              Обновить список
            </button>
            <button className="primary" onClick={() => setMode('create')} disabled={saving}>
              Новый торт
            </button>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Поиск по названию, slug, составу"
            />
          </div>

          <div className="list-scroll">
            {loading ? <p className="subtle">Загрузка...</p> : null}
            {!loading && filteredDesigns.length === 0 ? <p className="subtle">Ничего не найдено</p> : null}

            {filteredDesigns.map((design) => (
              <button
                key={design.id}
                className={`product-card ${mode === 'edit' && design.id === selectedId ? 'active' : ''}`}
                onClick={() => {
                  setSelectedId(design.id);
                  setMode('edit');
                }}
              >
                <div className="product-card-main">
                  {design.image_preview_url || design.image_url ? (
                    <img
                      className="product-thumb"
                      src={design.image_preview_url || design.image_url}
                      alt={design.name}
                      loading="lazy"
                    />
                  ) : (
                    <div className="product-thumb product-thumb-empty">Фото</div>
                  )}
                  <div>
                    <strong>{design.name}</strong>
                  </div>
                </div>
                <div className="chip-line">
                  <span className={`chip ${design.available ? 'ok' : 'off'}`}>
                    {design.available ? 'Доступен' : 'Скрыт'}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </aside>

        {mode === 'create' ? (
          <CakeDesignForm
            mode="create"
            draft={createDraft}
            imageFiles={createImageFiles}
            saving={saving}
            canSubmit={canCreate}
            onFieldChange={handleCreateFieldChange}
            onImageFilesSelected={(incomingFiles) =>
              setCreateImageFiles((current) =>
                mergeImageFiles(current, incomingFiles, normalizePhotos(createDraft.photos).length)
              )
            }
            onRemoveImageFile={(fileIndex) =>
              setCreateImageFiles((current) => removeImageFileByIndex(current, fileIndex))
            }
            onClearImageFiles={() => setCreateImageFiles([])}
            onRemovePhoto={handleRemoveCreatePhoto}
            onReset={() => {
              setCreateDraft(createEmptyDesignDraft());
              setCreateImageFiles([]);
            }}
            onSubmit={handleCreate}
          />
        ) : (
          <CakeDesignForm
            mode="edit"
            draft={draft || createEmptyDesignDraft()}
            imageFiles={imageFiles}
            saving={saving}
            deleting={deleting}
            canSubmit={canSave}
            onFieldChange={handleFieldChange}
            onImageFilesSelected={(incomingFiles) =>
              setImageFiles((current) =>
                mergeImageFiles(current, incomingFiles, normalizePhotos(draft?.photos).length)
              )
            }
            onRemoveImageFile={(fileIndex) =>
              setImageFiles((current) => removeImageFileByIndex(current, fileIndex))
            }
            onClearImageFiles={() => setImageFiles([])}
            onRemovePhoto={handleRemoveDraftPhoto}
            onReset={() => {
              setDraft(selectedDesign ? normalizeDesign(selectedDesign) : null);
              setImageFiles([]);
            }}
            onSubmit={handleSave}
            onDelete={handleDelete}
          />
        )}
      </section>
    </>
  );
}

export default CakeDesignsScreen;
