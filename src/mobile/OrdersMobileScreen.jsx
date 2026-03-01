function OrdersMobileScreen({
  error,
  status,
  view,
  loading,
  statusFilter,
  userFilter,
  statusOptions,
  userOptions,
  orders,
  selectedId,
  selectedOrder,
  draft,
  saving,
  isDirty,
  addressLoading,
  onStatusFilterChange,
  onUserFilterChange,
  onRefresh,
  onSelectOrder,
  onBackToList,
  onDraftStatusChange,
  onReset,
  onSave,
  formatDate,
  shortId,
  userLabel,
  formatAddress,
  statusFilterAll
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
                Обновить заказы
              </button>

              <select value={statusFilter} onChange={(event) => onStatusFilterChange(event.target.value)}>
                <option value={statusFilterAll}>Все статусы</option>
                {statusOptions
                  .filter((item) => item !== statusFilterAll)
                  .map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
              </select>

              <select value={userFilter} onChange={(event) => onUserFilterChange(event.target.value)}>
                {userOptions.map((item) => (
                  <option key={item.key} value={item.key}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="list-scroll mobile-list-scroll">
              {loading ? <p className="subtle">Загрузка заказов...</p> : null}
              {!loading && orders.length === 0 ? <p className="subtle">Заказов пока нет</p> : null}

              {orders.map((order) => (
                <button
                  key={order.id}
                  className={`product-card ${order.id === selectedId ? 'active' : ''}`}
                  onClick={() => onSelectOrder(order.id)}
                >
                  <div>
                    <strong>Заказ #{shortId(order.id)}</strong>
                    <p>{userLabel(order)}</p>
                    <p>{formatDate(order.created_at)}</p>
                  </div>
                  <div className="chip-line">
                    <span className="chip">{order.total_price} ₽</span>
                    <span className="chip">{order.items_count} шт.</span>
                    <span className="chip">{order.status}</span>
                  </div>
                </button>
              ))}
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
            {selectedOrder ? <span className="mobile-editor-id">Заказ #{shortId(selectedOrder.id)}</span> : null}
          </div>

          {!draft || !selectedOrder ? (
            <p className="subtle">Выберите заказ из списка</p>
          ) : (
            <>
              <div className="editor-head mobile-editor-head">
                <h2>Заказ #{shortId(selectedOrder.id)}</h2>
                <span>{formatDate(selectedOrder.created_at)}</span>
              </div>

              <div className="order-meta">
                <p>
                  <strong>Пользователь:</strong> {userLabel(selectedOrder)}
                </p>
                <p>
                  <strong>Сумма:</strong> {selectedOrder.total_price} ₽
                </p>
                <p>
                  <strong>Позиции:</strong> {selectedOrder.items_count}
                </p>
                <p>
                  <strong>Адрес:</strong> {addressLoading ? 'Загрузка адреса...' : formatAddress(selectedOrder.address)}
                </p>
                <p>
                  <strong>Комментарий:</strong> {selectedOrder.comment || '-'}
                </p>
              </div>

              <div className="form-grid">
                <label>
                  Статус
                  <select value={draft.status} onChange={(event) => onDraftStatusChange(event.target.value)}>
                    {statusOptions
                      .filter((item) => item !== statusFilterAll)
                      .map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                  </select>
                </label>
              </div>

              <div className="order-items">
                <h3>Состав заказа</h3>
                {selectedOrder.items.length === 0 ? <p className="subtle">Нет позиций</p> : null}
                {selectedOrder.items.map((item) => (
                  <div key={item.id} className="order-item-row">
                    <span>{item?.dessert?.name || `Dessert #${item.dessert_id}`}</span>
                    <span>{item.qty} x {item.price} ₽</span>
                    <strong>{item.sum} ₽</strong>
                  </div>
                ))}
              </div>

              <div className="mobile-editor-actions">
                <button className="ghost" onClick={onReset} disabled={!isDirty || saving}>
                  Отменить
                </button>
                <button className="primary save-action" onClick={onSave} disabled={!isDirty || saving}>
                  {saving ? 'Сохраняем...' : 'Сохранить заказ'}
                </button>
              </div>
            </>
          )}
        </section>
      </section>
    </>
  );
}

export default OrdersMobileScreen;
