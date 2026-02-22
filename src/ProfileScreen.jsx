function asText(value) {
  if (value === null || value === undefined || value === '') {
    return '-';
  }

  return String(value);
}

function ProfileScreen({ user }) {
  return (
    <section className="panel profile-panel">
      <div className="editor-head">
        <h2>Профиль</h2>
        <span>ID: {asText(user?.id)}</span>
      </div>

      <div className="profile-grid">
        <div>
          <p className="profile-label">Username</p>
          <p>{asText(user?.username)}</p>
        </div>
        <div>
          <p className="profile-label">Email</p>
          <p>{asText(user?.email)}</p>
        </div>
        <div>
          <p className="profile-label">Имя</p>
          <p>{asText(user?.first_name)}</p>
        </div>
        <div>
          <p className="profile-label">Фамилия</p>
          <p>{asText(user?.last_name)}</p>
        </div>
        <div>
          <p className="profile-label">Телефон</p>
          <p>{asText(user?.phone)}</p>
        </div>
        <div>
          <p className="profile-label">Роль</p>
          <p>{user?.is_staff ? 'Администратор' : 'Пользователь'}</p>
        </div>
      </div>

      <p className="support-note">
        Если данные неверные, обратитесь в службу поддержки:{' '}
        <a href="mailto:a66110222@gmail.com">a66110222@gmail.com</a>
      </p>
    </section>
  );
}

export default ProfileScreen;
