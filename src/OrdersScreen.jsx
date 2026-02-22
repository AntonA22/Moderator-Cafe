import { useEffect, useMemo, useState } from 'react';
import { fetchAddressById, fetchOrders, updateOrder } from './api';

const STATUS_OPTIONS = ['new', 'processing', 'shipped', 'delivered', 'cancelled'];
const STATUS_FILTER_ALL = 'all';
const USER_FILTER_ALL = 'all';

function normalizeOrder(order) {
  return {
    ...order,
    status: order?.status || 'new',
    comment: order?.comment || '',
    items: Array.isArray(order?.items) ? order.items : [],
    user: order?.user || null,
    address: order?.address || null
  };
}

function formatDate(value) {
  if (!value) {
    return '-';
  }

  return new Date(value).toLocaleString('ru-RU');
}

function shortId(value) {
  if (!value) {
    return '-';
  }

  const stringValue = String(value);
  if (stringValue.length <= 12) {
    return stringValue;
  }

  return `${stringValue.slice(0, 8)}...${stringValue.slice(-4)}`;
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

function formatAddress(address) {
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

function OrdersScreen() {
  const [orders, setOrders] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [statusFilter, setStatusFilter] = useState(STATUS_FILTER_ALL);
  const [userFilter, setUserFilter] = useState(USER_FILTER_ALL);
  const [draft, setDraft] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [addressLoading, setAddressLoading] = useState(false);
  const [addressCache, setAddressCache] = useState({});

  const statusOptions = useMemo(() => {
    const unique = new Set(orders.map((order) => order.status).filter(Boolean));
    STATUS_OPTIONS.forEach((item) => unique.add(item));
    return [STATUS_FILTER_ALL, ...Array.from(unique)];
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
    return orders.filter((order) => {
      const byStatus = statusFilter === STATUS_FILTER_ALL || order.status === statusFilter;
      const byUser = userFilter === USER_FILTER_ALL || userKey(order) === userFilter;
      return byStatus && byUser;
    });
  }, [orders, statusFilter, userFilter]);

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

  async function loadOrders({ keepSelection = true } = {}) {
    setLoading(true);
    setError('');

    try {
      const ordersData = await fetchOrders();
      const normalized = ordersData.map((item) => normalizeOrder(item));
      setOrders(normalized);

      if (!keepSelection) {
        setSelectedId(null);
      } else if (selectedId && !normalized.some((item) => item.id === selectedId)) {
        setSelectedId(null);
      }
    } catch (requestError) {
      setError(`Не удалось загрузить заказы: ${requestError.message}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadOrders({ keepSelection: false });
  }, []);

  useEffect(() => {
    if (filteredOrders.length === 0) {
      setSelectedId(null);
      return;
    }

    if (selectedId && !filteredOrders.some((item) => item.id === selectedId)) {
      setSelectedId(null);
    }
  }, [filteredOrders, selectedId]);

  useEffect(() => {
    if (!selectedOrder) {
      setDraft(null);
      setStatus('');
      return;
    }

    setDraft({
      id: selectedOrder.id,
      status: selectedOrder.status
    });
    setStatus('');
  }, [selectedOrder]);

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

      await updateOrder(selectedOrder.id, payload);

      setOrders((current) =>
        current.map((order) =>
          order.id === selectedOrder.id
            ? {
                ...order,
                status: payload.status
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

  return (
    <section className="content">
      <aside className="panel list-panel">
        <div className="controls">
          <button className="ghost" onClick={() => loadOrders()} disabled={loading}>
            Обновить заказы
          </button>

          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value={STATUS_FILTER_ALL}>Все статусы</option>
            {statusOptions
              .filter((item) => item !== STATUS_FILTER_ALL)
              .map((item) => (
                <option key={item} value={item}>
                  {item}
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
        </div>

        <div className="list-scroll">
          {loading ? <p className="subtle">Загрузка заказов...</p> : null}
          {!loading && filteredOrders.length === 0 ? <p className="subtle">Заказов пока нет</p> : null}

          {filteredOrders.map((order) => (
            <button
              key={order.id}
              className={`product-card ${order.id === selectedId ? 'active' : ''}`}
              onClick={() => setSelectedId(order.id)}
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
      </aside>

      <section className="panel editor-panel">
        {error ? <p className="message error">{error}</p> : null}
        {status ? <p className="message success">{status}</p> : null}

        {!draft || !selectedOrder ? (
          <p className="subtle">Выберите заказ из списка слева</p>
        ) : (
          <>
            <div className="editor-head">
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
                <strong>Адрес:</strong>{' '}
                {addressLoading ? 'Загрузка адреса...' : formatAddress(selectedOrder.address)}
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
                  {statusOptions
                    .filter((item) => item !== STATUS_FILTER_ALL)
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
  );
}

export default OrdersScreen;
