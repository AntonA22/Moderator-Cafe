function CreateProductScreen({
  error,
  status,
  draft,
  photoFilesCount,
  saving,
  canCreate,
  onFieldChange,
  onFilesSelected,
  onReset,
  onSubmit
}) {
  return (
    <>
      {error ? <p className="message error">{error}</p> : null}
      {status ? <p className="message success">{status}</p> : null}

      <section className="create-content">
        <section className="panel editor-panel create-panel">
          <div className="editor-head">
            <h2>Новая позиция меню</h2>
          </div>

          <div className="form-grid">
            <label>
              Название
              <input value={draft.name} onChange={(event) => onFieldChange('name', event.target.value)} />
            </label>

            <label>
              Категория
              <input value={draft.category} onChange={(event) => onFieldChange('category', event.target.value)} />
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
              <input
                type="number"
                value={draft.weight}
                onChange={(event) => onFieldChange('weight', event.target.value)}
              />
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
              <span className="subtle">Файлы будут загружены сразу после создания продукта.</span>
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

          <div className="editor-actions">
            <button className="ghost" onClick={onReset} disabled={!canCreate || saving}>
              Очистить
            </button>
            <button className="primary save-action" onClick={onSubmit} disabled={!canCreate || saving}>
              {saving
                ? 'Создаём...'
                : photoFilesCount > 0
                  ? 'Создать и загрузить фото'
                  : 'Создать позицию'}
            </button>
          </div>
        </section>
      </section>
    </>
  );
}

export default CreateProductScreen;
