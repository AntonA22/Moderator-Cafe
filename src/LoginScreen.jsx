import { useEffect, useState } from 'react';

function LoginScreen({ defaultLogin = '', loading, error, onSubmit }) {
  const [login, setLogin] = useState(defaultLogin);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    setLogin(defaultLogin || '');
  }, [defaultLogin]);

  async function handleSubmit(event) {
    event.preventDefault();
    await onSubmit({
      login: login.trim(),
      password
    });
  }

  return (
    <div className="page-bg">
      <div className="grain" />
      <main className="layout login-layout">
        <section className="panel login-panel">
          <p className="eyebrow">Панель модератора</p>
          <h1>Вход в систему</h1>
          <p className="subtle">Введите данные аккаунта, чтобы редактировать каталог.</p>

          {error ? <p className="message error">{error}</p> : null}

          <form className="login-form" onSubmit={handleSubmit}>
            <label>
              Логин
              <input
                type="text"
                value={login}
                onChange={(event) => setLogin(event.target.value)}
                placeholder="username или mail@mail.ru"
              />
            </label>

            <label>
              Пароль
              <span className="password-field">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="********"
                />
                <button
                  className="password-toggle-btn"
                  type="button"
                  onClick={() => setShowPassword((current) => !current)}
                  disabled={loading || !password}
                >
                  {showPassword ? 'Скрыть' : 'Показать'}
                </button>
              </span>
            </label>

            <button className="primary" type="submit" disabled={loading}>
              {loading ? 'Входим...' : 'Войти'}
            </button>
          </form>

          <p className="support-note">
            Нет аккаунта? Обратиться в службу поддержки:{' '}
            <a href="mailto:a66110222@gmail.com">a66110222@gmail.com</a>
          </p>
        </section>
      </main>
    </div>
  );
}

export default LoginScreen;
