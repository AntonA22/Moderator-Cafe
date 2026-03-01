function MenuMobileScreen({
  error,
  status,
  view,
  loading,
  search,
  category,
  categories,
  products,
  selectedId,
  draft,
  draftPhotoUrls,
  saving,
  canSave,
  isDirty,
  hasPendingPhotos,
  photoFilesCount,
  onSearchChange,
  onCategoryChange,
  onRefresh,
  onSelectProduct,
  onBackToList,
  onFieldChange,
  onDeletePhoto,
  onPreviewPhoto,
  onFilesSelected,
  onReset,
  onSave,
  onDelete
}) {
  if (view === 'list') {
    return (
      <>
        {error ? <p className="message error">{error}</p> : null}
        {status ? <p className="message success">{status}</p> : null}

        <section className="mobile-menu-screen">
          <div className="panel mobile-menu-panel">
            <div className="controls">
              <button className="ghost" onClick={onRefresh} disabled={loading}>
                Обновить список
              </button>

              <input
                value={search}
                onChange={(event) => onSearchChange(event.target.value)}
                placeholder="Поиск по названию и описанию"
              />

              <select value={category} onChange={(event) => onCategoryChange(event.target.value)}>
                {categories.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>

            <div className="list-scroll mobile-list-scroll">
              {loading ? <p className="subtle">Загрузка...</p> : null}
              {!loading && products.length === 0 ? <p className="subtle">Ничего не найдено</p> : null}

              {products.map((product) => {
                const coverPhoto = Array.isArray(product.photos) ? product.photos[0] || '' : '';

                return (
                  <button
                    key={product.id}
                    className={`product-card ${product.id === selectedId ? 'active' : ''}`}
                    onClick={() => onSelectProduct(product.id)}
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
          </div>
        </section>
      </>
    );
  }

  return (
    <>
      {error ? <p className="message error">{error}</p> : null}
      {status ? <p className="message success">{status}</p> : null}

      <section className="mobile-menu-screen">
        <section className="panel editor-panel mobile-editor-panel">
          <div className="mobile-editor-topbar">
            <button className="ghost mobile-back-btn" onClick={onBackToList} disabled={saving}>
              К списку
            </button>
            {draft ? <span className="mobile-editor-id">ID: {draft.id}</span> : null}
          </div>

          {!draft ? (
            <p className="subtle">Выберите продукт из списка</p>
          ) : (
            <>
              <div className="editor-head mobile-editor-head">
                <h2>{draft.name || 'Без названия'}</h2>
              </div>

              <div className="form-grid">
                <label>
                  Название
                  <input value={draft.name} onChange={(event) => onFieldChange('name', event.target.value)} />
                </label>

                <label>
                  Категория
                  <input
                    value={draft.category}
                    onChange={(event) => onFieldChange('category', event.target.value)}
                  />
                </label>

                <label className="full">
                  Описание
                  <textarea
                    rows="3"
                    value={draft.description}
                    onChange={(event) => onFieldChange('description', event.target.value)}
                  />
                </label>

                <label>
                  Цена (₽)
                  <input type="number" value={draft.price} onChange={(event) => onFieldChange('price', event.target.value)} />
                </label>

                <label>
                  Вес (г)
                  <input type="number" value={draft.weight} onChange={(event) => onFieldChange('weight', event.target.value)} />
                </label>

                <label>
                  Калории
                  <input
                    type="number"
                    value={draft.calories}
                    onChange={(event) => onFieldChange('calories', event.target.value)}
                  />
                </label>

                <label>
                  Белки
                  <input
                    type="number"
                    step="0.1"
                    value={draft.proteins}
                    onChange={(event) => onFieldChange('proteins', event.target.value)}
                  />
                </label>

                <label>
                  Жиры
                  <input type="number" step="0.1" value={draft.fats} onChange={(event) => onFieldChange('fats', event.target.value)} />
                </label>

                <label>
                  Углеводы
                  <input
                    type="number"
                    step="0.1"
                    value={draft.carbohydrates}
                    onChange={(event) => onFieldChange('carbohydrates', event.target.value)}
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
                          <button type="button" className="photo-open-btn" onClick={() => onPreviewPhoto(url)}>
                            <img src={url} alt={`${draft.name || 'Продукт'} ${index + 1}`} loading="lazy" />
                          </button>
                          <button
                            type="button"
                            className="photo-delete-btn"
                            onClick={() => onDeletePhoto(index)}
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
                      onFilesSelected(incomingFiles);
                      event.target.value = '';
                    }}
                  />
                  <span className="subtle">Файлы загрузятся в Supabase при нажатии кнопки сохранения.</span>
                  {photoFilesCount === 0 ? (
                    <span className="subtle">Файлы пока не выбраны.</span>
                  ) : (
                    <span className="subtle">Выбрано файлов: {photoFilesCount}</span>
                  )}
                </label>

                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={draft.available}
                    onChange={(event) => onFieldChange('available', event.target.checked)}
                  />
                  Доступен для заказа
                </label>
              </div>

              <div className="mobile-editor-actions">
                <button className="danger" onClick={onDelete} disabled={saving}>
                  {saving ? 'Удаляем...' : 'Удалить'}
                </button>
                <button className="ghost" onClick={onReset} disabled={(!isDirty && !hasPendingPhotos) || saving}>
                  Отменить
                </button>
                <button className="primary save-action" onClick={onSave} disabled={!canSave || saving}>
                  {saving
                    ? 'Сохраняем...'
                    : hasPendingPhotos
                      ? 'Загрузить и сохранить'
                      : 'Сохранить'}
                </button>
              </div>
            </>
          )}
        </section>
      </section>
    </>
  );
}

export default MenuMobileScreen;
