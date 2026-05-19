import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchAddressById, fetchOrders, updateOrder } from './api';
import OrdersMobileScreen from './mobile/OrdersMobileScreen';

const PHONE_MEDIA_QUERY = '(max-width: 700px)';
const STATUS_OPTIONS = ['new', 'processing', 'shipped', 'delivered', 'cancelled'];
const STATUS_FILTER_ALL = 'all';
const STATUS_FILTER_OPTIONS = [
  { value: STATUS_FILTER_ALL, label: 'Все статусы' },
  { value: 'new', label: 'Новый', status: 'new' },
  { value: 'processing', label: 'Готовится', status: 'processing' },
  { value: 'shipped_delivery', label: 'В пути', status: 'shipped', deliveryMode: 'delivery' },
  { value: 'shipped_pickup', label: 'Готов к выдаче', status: 'shipped', deliveryMode: 'pickup' },
  { value: 'delivered_delivery', label: 'Доставлен', status: 'delivered', deliveryMode: 'delivery' },
  { value: 'delivered_pickup', label: 'Выдан', status: 'delivered', deliveryMode: 'pickup' },
  { value: 'cancelled', label: 'Отменён', status: 'cancelled' }
];
const USER_FILTER_ALL = 'all';
const DELIVERY_FILTER_ALL = 'all';
const DELIVERY_FILTER_OPTIONS = [
  { value: DELIVERY_FILTER_ALL, label: 'Все заказы' },
  { value: 'delivery', label: 'Доставка' },
  { value: 'pickup', label: 'Самовывоз' }
];
const MOBILE_ORDER_LIST = 'list';
const MOBILE_ORDER_EDITOR = 'editor';
const STATUS_TITLES = {
  new: 'Новый',
  processing: 'Готовится',
  shipped: 'В пути',
  delivered: 'Доставлен',
  cancelled: 'Отменён'
};
const PICKUP_STATUS_TITLES = {
  ...STATUS_TITLES,
  shipped: 'Готов к выдаче',
  delivered: 'Выдан'
};
const PICKUP_ADDRESS = 'Проспект Мира, 95с1';
const ALLOWED_TRANSITIONS = {
  new: ['processing', 'cancelled'],
  processing: ['shipped', 'cancelled'],
  shipped: ['delivered'],
  delivered: [],
  cancelled: []
};

function normalizeOrder(order) {
  const normalizedStatus = order?.status === 'canceled' ? 'cancelled' : order?.status || 'new';

  return {
    ...order,
    status: normalizedStatus,
    comment: order?.comment || '',
    bonus_points_spent: Number(order?.bonus_points_spent || 0),
    bonus_points_earned: Number(order?.bonus_points_earned || 0),
    items: Array.isArray(order?.items) ? order.items : [],
    user: order?.user || null,
    address: order?.address || null,
    delivery_mode: order?.delivery_mode || 'delivery'
  };
}

function formatDate(value) {
  if (!value) {
    return '-';
  }

  return new Date(value).toLocaleString('ru-RU');
}

function formatDateInputValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function currentWeekRange() {
  const today = new Date();
  const mondayOffset = (today.getDay() + 6) % 7;
  const start = new Date(today);
  start.setHours(0, 0, 0, 0);
  start.setDate(today.getDate() - mondayOffset);

  const end = new Date(start);
  end.setDate(start.getDate() + 6);

  return {
    from: formatDateInputValue(start),
    to: formatDateInputValue(end)
  };
}

function isPickupOrder(order) {
  return order?.delivery_mode === 'pickup';
}

function statusTitle(value, order = null) {
  const titles = isPickupOrder(order) ? PICKUP_STATUS_TITLES : STATUS_TITLES;
  return titles[value] || value || '-';
}

function statusFilterOption(value) {
  return STATUS_FILTER_OPTIONS.find((item) => item.value === value) || STATUS_FILTER_OPTIONS[0];
}

function editableStatusOptions(order) {
  if (!order) {
    return [];
  }

  return [order.status, ...(ALLOWED_TRANSITIONS[order.status] || [])];
}

function bonusEarnedPreview(order) {
  if (!order) {
    return 0;
  }

  if (Number(order.bonus_points_earned || 0) > 0) {
    return Number(order.bonus_points_earned);
  }

  const subtotal = Number(order.subtotal_price ?? order.total_price ?? 0);
  const spent = Number(order.bonus_points_spent || 0);
  return Math.floor(Math.max(0, subtotal - spent) * 0.05);
}

function formatOrderNumber(value) {
  const digits = String(value || '').replace(/\D/g, '');

  if (!digits) {
    return '-';
  }

  const tenDigits = digits.slice(-10).padStart(10, '0');
  return `${tenDigits.slice(0, 5)}-${tenDigits.slice(5)}`;
}

function orderNumberLabel(order) {
  return order?.formatted_order_number || formatOrderNumber(order?.order_number || order?.id);
}

function userKey(order) {
  if (order?.user?.id !== undefined && order?.user?.id !== null) {
    return String(order.user.id);
  }

  if (order?.user_id !== undefined && order?.user_id !== null) {
    return String(order.user_id);
  }

  return 'unknown';
}

function userLabel(order) {
  const username = order?.user?.username || null;
  const email = order?.user?.email || null;

  if (username && email) {
    return `${username} (${email})`;
  }

  if (username || email) {
    return username || email;
  }

  if (order?.user_id !== undefined && order?.user_id !== null) {
    return `Пользователь #${order.user_id}`;
  }

  return 'Неизвестный пользователь';
}

function customerPhone(order) {
  return order?.customer_phone || order?.user?.phone || '-';
}

function formatAddress(address, order = null) {
  if (isPickupOrder(order)) {
    return PICKUP_ADDRESS;
  }

  if (!address) {
    return '-';
  }

  const details = [
    address?.base_address,
    address?.entrance ? `подъезд ${address.entrance}` : null,
    address?.floor ? `этаж ${address.floor}` : null,
    address?.flat ? `кв. ${address.flat}` : null
  ].filter(Boolean);

  return details.join(', ') || '-';
}

function orderItemName(item) {
  return item?.dessert?.name || `Dessert #${item.dessert_id}`;
}

function orderItemPhoto(item) {
  const photos = item?.dessert?.photos;
  return Array.isArray(photos) ? photos.find(Boolean) || null : null;
}

function orderItemDescription(item) {
  if (item?.dessert?.category !== 'custom_cake') {
    return '';
  }

  return String(item?.dessert?.description || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith('Надпись:') || line.startsWith('Пожелания:') || line.startsWith('Вес:'))
    .join('\n');
}

function readInitialPhoneLayout() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }

  return window.matchMedia(PHONE_MEDIA_QUERY).matches;
}

function OrdersScreen() {
  const initialDateRange = useMemo(() => currentWeekRange(), []);
  const [isPhoneLayout, setIsPhoneLayout] = useState(() => readInitialPhoneLayout());
  const [mobileOrderView, setMobileOrderView] = useState(MOBILE_ORDER_LIST);
  const [orders, setOrders] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const selectedIdRef = useRef(null);
  const [statusFilter, setStatusFilter] = useState(STATUS_FILTER_ALL);
  const [userFilter, setUserFilter] = useState(USER_FILTER_ALL);
  const [deliveryModeFilter, setDeliveryModeFilter] = useState(DELIVERY_FILTER_ALL);
  const [dateFrom, setDateFrom] = useState(initialDateRange.from);
  const [dateTo, setDateTo] = useState(initialDateRange.to);
  const [draft, setDraft] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [addressLoading, setAddressLoading] = useState(false);
  const [addressCache, setAddressCache] = useState({});

  const statusOptions = useMemo(() => {
    const unique = new Set(orders.map((order) => order.status).filter(Boolean));
    const extraStatuses = Array.from(unique).filter((item) => !STATUS_OPTIONS.includes(item));
    const extraOptions = extraStatuses.map((status) => ({ value: status, label: status, status }));
    return [...STATUS_FILTER_OPTIONS, ...extraOptions];
  }, [orders]);

  const userOptions = useMemo(() => {
    const map = new Map();

    orders.forEach((order) => {
      const key = userKey(order);
      if (!map.has(key)) {
        map.set(key, userLabel(order));
      }
    });

    return [{ key: USER_FILTER_ALL, label: 'Все пользователи' }, ...Array.from(map.entries()).map(([key, label]) => ({ key, label }))];
  }, [orders]);

  const filteredOrders = useMemo(() => {
    const statusOption = statusFilterOption(statusFilter);

    return orders.filter((order) => {
      const byStatus = statusFilter === STATUS_FILTER_ALL || order.status === statusOption.status;
      const byStatusDeliveryMode = !statusOption.deliveryMode || order.delivery_mode === statusOption.deliveryMode;
      const byUser = userFilter === USER_FILTER_ALL || userKey(order) === userFilter;
      const byDeliveryMode = deliveryModeFilter === DELIVERY_FILTER_ALL || order.delivery_mode === deliveryModeFilter;
      return byStatus && byStatusDeliveryMode && byUser && byDeliveryMode;
    });
  }, [orders, statusFilter, userFilter, deliveryModeFilter]);

  const selectedOrder = useMemo(
    () => filteredOrders.find((order) => order.id === selectedId) || null,
    [filteredOrders, selectedId]
  );

  const isDirty = useMemo(() => {
    if (!selectedOrder || !draft) {
      return false;
    }

    return selectedOrder.status !== draft.status;
  }, [selectedOrder, draft]);
  const editableStatuses = useMemo(() => editableStatusOptions(selectedOrder), [selectedOrder]);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  const loadOrders = useCallback(async ({ keepSelection = true } = {}) => {
    setLoading(true);
    setError('');

    try {
      const ordersData = await fetchOrders({ dateFrom, dateTo, deliveryMode: deliveryModeFilter });
      const normalized = ordersData.map((item) => normalizeOrder(item));
      setOrders(normalized);

      if (!keepSelection) {
        setSelectedId(null);
      } else if (selectedIdRef.current && !normalized.some((item) => item.id === selectedIdRef.current)) {
        setSelectedId(null);
      }
    } catch (requestError) {
      setError(`Не удалось загрузить заказы: ${requestError.message}`);
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, deliveryModeFilter]);

  useEffect(() => {
    loadOrders({ keepSelection: false });
  }, [loadOrders]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }

    const mediaQuery = window.matchMedia(PHONE_MEDIA_QUERY);

    function handleMediaChange(event) {
      setIsPhoneLayout(event.matches);
      if (!event.matches) {
        setMobileOrderView(MOBILE_ORDER_LIST);
      }
    }

    setIsPhoneLayout(mediaQuery.matches);

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handleMediaChange);
      return () => mediaQuery.removeEventListener('change', handleMediaChange);
    }

    mediaQuery.addListener(handleMediaChange);
    return () => mediaQuery.removeListener(handleMediaChange);
  }, []);

  useEffect(() => {
    if (filteredOrders.length === 0) {
      setSelectedId(null);
      setMobileOrderView(MOBILE_ORDER_LIST);
      return;
    }

    if (selectedId && !filteredOrders.some((item) => item.id === selectedId)) {
      setSelectedId(null);
      setMobileOrderView(MOBILE_ORDER_LIST);
    }
  }, [filteredOrders, selectedId]);

  useEffect(() => {
    if (!selectedOrder) {
      setDraft(null);
      return;
    }

    setDraft({
      id: selectedOrder.id,
      status: selectedOrder.status
    });
  }, [selectedOrder]);

  useEffect(() => {
    setStatus('');
    setError('');
  }, [selectedId]);

  function handleSelectOrder(orderId) {
    setSelectedId(orderId);

    if (isPhoneLayout) {
      setMobileOrderView(MOBILE_ORDER_EDITOR);
    }
  }

  useEffect(() => {
    if (!selectedOrder?.address_id || selectedOrder?.address) {
      setAddressLoading(false);
      return;
    }

    const addressId = selectedOrder.address_id;
    const selectedOrderId = selectedOrder.id;
    const cached = addressCache[addressId];

    if (cached !== undefined) {
      if (cached) {
        setOrders((current) =>
          current.map((order) =>
            order.id === selectedOrderId ? { ...order, address: cached } : order
          )
        );
      }
      setAddressLoading(false);
      return;
    }

    let isCancelled = false;
    setAddressLoading(true);

    fetchAddressById(addressId)
      .then((address) => {
        if (isCancelled) {
          return;
        }

        setAddressCache((current) => ({ ...current, [addressId]: address || null }));

        if (address) {
          setOrders((current) =>
            current.map((order) =>
              order.id === selectedOrderId ? { ...order, address } : order
            )
          );
        }
      })
      .catch(() => {
        if (isCancelled) {
          return;
        }
        setAddressCache((current) => ({ ...current, [addressId]: null }));
      })
      .finally(() => {
        if (!isCancelled) {
          setAddressLoading(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [selectedOrder, addressCache]);

  async function handleSave() {
    if (!draft || !selectedOrder) {
      return;
    }

    setSaving(true);
    setError('');
    setStatus('');

    try {
      const payload = { status: draft.status };

      if (payload.status === 'delivered') {
        const ok = window.confirm(
          `Отметить заказ доставленным и начислить ${bonusEarnedPreview(selectedOrder)} бонусов?`
        );
        if (!ok) {
          return;
        }
      }

      const updatedOrder = normalizeOrder(await updateOrder(selectedOrder.id, payload));

      setOrders((current) =>
        current.map((order) =>
          order.id === selectedOrder.id
            ? {
                ...updatedOrder,
                address: updatedOrder.address || order.address
              }
            : order
        )
      );

      setStatus(`Сохранено: ${new Date().toLocaleString('ru-RU')}`);
    } catch (saveError) {
      setError(`Ошибка сохранения заказа: ${saveError.message}`);
    } finally {
      setSaving(false);
    }
  }

  if (isPhoneLayout) {
    return (
      <OrdersMobileScreen
        error={error}
        status={status}
        view={mobileOrderView}
        loading={loading}
        statusFilter={statusFilter}
        userFilter={userFilter}
        deliveryModeFilter={deliveryModeFilter}
        dateFrom={dateFrom}
        dateTo={dateTo}
        statusOptions={statusOptions}
        editableStatuses={editableStatuses}
        userOptions={userOptions}
        deliveryFilterOptions={DELIVERY_FILTER_OPTIONS}
        orders={filteredOrders}
        selectedId={selectedId}
        selectedOrder={selectedOrder}
        draft={draft}
        saving={saving}
        isDirty={isDirty}
        addressLoading={addressLoading}
        onStatusFilterChange={setStatusFilter}
        onUserFilterChange={setUserFilter}
        onDeliveryModeFilterChange={setDeliveryModeFilter}
        onDateFromChange={setDateFrom}
        onDateToChange={setDateTo}
        onRefresh={() => loadOrders()}
        onSelectOrder={handleSelectOrder}
        onBackToList={() => setMobileOrderView(MOBILE_ORDER_LIST)}
        onDraftStatusChange={(value) => setDraft((current) => ({ ...current, status: value }))}
        onReset={() =>
          setDraft({
            id: selectedOrder.id,
            status: selectedOrder.status
          })
        }
        onSave={handleSave}
        formatDate={formatDate}
        orderNumberLabel={orderNumberLabel}
        userLabel={userLabel}
        customerPhone={customerPhone}
        formatAddress={formatAddress}
        isPickupOrder={isPickupOrder}
        statusTitle={statusTitle}
        bonusEarnedPreview={bonusEarnedPreview}
      />
    );
  }

  return (
    <>
      {error ? <p className="message error">{error}</p> : null}
      {status ? <p className="message success">{status}</p> : null}

      <section className="content">
        <aside className="panel list-panel">
        <div className="controls">
          <button className="ghost" onClick={() => loadOrders()} disabled={loading}>
            Обновить заказы
          </button>

          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            {statusOptions
              .map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
          </select>

          <select value={deliveryModeFilter} onChange={(event) => setDeliveryModeFilter(event.target.value)}>
            {DELIVERY_FILTER_OPTIONS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>

          <select value={userFilter} onChange={(event) => setUserFilter(event.target.value)}>
            {userOptions.map((item) => (
              <option key={item.key} value={item.key}>
                {item.label}
              </option>
            ))}
          </select>

          <label className="inline-filter">
            С
            <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
          </label>

          <label className="inline-filter">
            По
            <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
          </label>
        </div>

        <div className="list-scroll">
          {loading ? <p className="subtle">Загрузка заказов...</p> : null}
          {!loading && filteredOrders.length === 0 ? <p className="subtle">Заказов пока нет</p> : null}

          {filteredOrders.map((order) => (
            <button
              key={order.id}
              className={`product-card ${order.id === selectedId ? 'active' : ''}`}
              onClick={() => handleSelectOrder(order.id)}
            >
              <div>
                <strong>Заказ {orderNumberLabel(order)}</strong>
                <p>{userLabel(order)}</p>
                <p>{formatDate(order.created_at)}</p>
              </div>
              <div className="chip-line">
                <span className="chip">{order.total_price} ₽</span>
                <span className="chip">{order.items_count} шт.</span>
                <span className="chip">{statusTitle(order.status, order)}</span>
              </div>
            </button>
          ))}
        </div>
        </aside>

        <section className="panel editor-panel">
          {!draft || !selectedOrder ? (
            <p className="subtle">Выберите заказ из списка слева</p>
          ) : (
            <>
              <div className="editor-head">
                <h2>Заказ {orderNumberLabel(selectedOrder)}</h2>
                <span>{formatDate(selectedOrder.created_at)}</span>
              </div>

              <div className="order-meta">
                <p>
                  <strong>Пользователь:</strong> {userLabel(selectedOrder)}
                </p>
                <p>
                  <strong>Телефон:</strong> {customerPhone(selectedOrder)}
                </p>
                <p>
                  <strong>Сумма:</strong> {selectedOrder.total_price} ₽
                </p>
                <p>
                  <strong>Бонусы:</strong> списано {selectedOrder.bonus_points_spent} / начислится{' '}
                  {bonusEarnedPreview(selectedOrder)}
                </p>
                <p>
                  <strong>Позиции:</strong> {selectedOrder.items_count}
                </p>
                <p>
                  <strong>{isPickupOrder(selectedOrder) ? 'Самовывоз:' : 'Адрес:'}</strong>{' '}
                  {addressLoading ? 'Загрузка адреса...' : formatAddress(selectedOrder.address, selectedOrder)}
                </p>
                <p>
                  <strong>Комментарий:</strong> {selectedOrder.comment || '-'}
                </p>
              </div>

              <div className="form-grid">
                <label>
                  Статус
                  <select
                    value={draft.status}
                    onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value }))}
                  >
                    {editableStatuses
                      .map((option) => (
                        <option key={option} value={option}>
                          {statusTitle(option, selectedOrder)}
                        </option>
                      ))}
                  </select>
                </label>

              </div>

              <div className="order-items">
                <h3>Состав заказа</h3>
                <div className="order-meta order-totals">
                  <p>
                    <strong>Товары:</strong> {selectedOrder.subtotal_price ?? selectedOrder.total_price} ₽
                  </p>
                  <p>
                    <strong>{isPickupOrder(selectedOrder) ? 'Самовывоз:' : 'Доставка:'}</strong>{' '}
                    {isPickupOrder(selectedOrder) ? 0 : selectedOrder.delivery_fee ?? 0} ₽
                  </p>
                  <p>
                    <strong>Списано бонусов:</strong> {selectedOrder.bonus_points_spent}
                  </p>
                </div>
                {selectedOrder.items.length === 0 ? <p className="subtle">Нет позиций</p> : null}
                {selectedOrder.items.map((item) => (
                  <div key={item.id} className="order-item-row">
                    <div className="order-item-product">
                      {orderItemPhoto(item) ? <img src={orderItemPhoto(item)} alt="" /> : null}
                      <div>
                        <strong>{orderItemName(item)}</strong>
                        {orderItemDescription(item) ? <p>{orderItemDescription(item)}</p> : null}
                      </div>
                    </div>
                    <span>{item.qty} x {item.price} ₽</span>
                    <strong>{item.sum} ₽</strong>
                  </div>
                ))}
              </div>

              <div className="editor-actions">
                <button
                  className="ghost"
                  onClick={() =>
                    setDraft({
                      id: selectedOrder.id,
                      status: selectedOrder.status
                    })
                  }
                  disabled={!isDirty || saving}
                >
                  Отменить
                </button>
                <button className="primary save-action" onClick={handleSave} disabled={!isDirty || saving}>
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

export default OrdersScreen;
