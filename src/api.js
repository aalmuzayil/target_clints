const TOKEN_KEY = 'mygov_admin_token'

export const getToken = () => localStorage.getItem(TOKEN_KEY)
export const setToken = (t) => localStorage.setItem(TOKEN_KEY, t)
export const clearToken = () => localStorage.removeItem(TOKEN_KEY)

async function handle(res) {
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || 'حدث خطأ')
  return data
}

export const listAgencies = () => fetch('/api/agencies').then(handle)

export const login = (email, password) =>
  fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  }).then(handle)

const authHeaders = () => ({ Authorization: `Bearer ${getToken()}` })

export const createAgency = (formData) =>
  fetch('/api/agencies', { method: 'POST', headers: authHeaders(), body: formData }).then(handle)

export const updateAgency = (id, formData) =>
  fetch(`/api/agencies/${id}`, { method: 'PUT', headers: authHeaders(), body: formData }).then(handle)

export const deleteAgency = (id) =>
  fetch(`/api/agencies/${id}`, { method: 'DELETE', headers: authHeaders() }).then(handle)
