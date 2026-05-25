const ADMIN_KEY = 'aktham_admin_token'
const PHONE_KEY = 'aktham_phone_token'
const PHONE_NUM = 'aktham_phone_number'

export const getAdminToken = () => localStorage.getItem(ADMIN_KEY)
export const setAdminToken = (t) => localStorage.setItem(ADMIN_KEY, t)
export const clearAdminToken = () => localStorage.removeItem(ADMIN_KEY)

export const getPhoneToken = () => localStorage.getItem(PHONE_KEY)
export const getPhoneNumber = () => localStorage.getItem(PHONE_NUM)
export const setPhoneSession = (t, phone) => {
  localStorage.setItem(PHONE_KEY, t)
  localStorage.setItem(PHONE_NUM, phone)
}
export const clearPhoneSession = () => {
  localStorage.removeItem(PHONE_KEY)
  localStorage.removeItem(PHONE_NUM)
}

async function handle(res) {
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || 'حدث خطأ')
  return data
}
const req = (url, opts) => fetch(url, opts).then(handle)
const adminH = () => ({ Authorization: `Bearer ${getAdminToken()}` })
const phoneH = () => ({ Authorization: `Bearer ${getPhoneToken()}` })

// ---- public catalog ----
export const listCompanies = () => req('/api/companies')
export const listCategories = () => req('/api/companies/categories')
export const getCompany = (id) => req(`/api/companies/${id}`)

// ---- phone auth ----
export const requestOtp = (phone) =>
  req('/api/auth/request-otp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone }) })
export const verifyOtp = (phone, code) =>
  req('/api/auth/verify-otp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone, code }) })

// ---- user actions ----
export const reserveCompany = (id, message = '') =>
  req(`/api/companies/${id}/reserve`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...phoneH() }, body: JSON.stringify({ message }) })
export const submitCompany = (name, category = '') =>
  req('/api/companies/submit', { method: 'POST', headers: { 'Content-Type': 'application/json', ...phoneH() }, body: JSON.stringify({ name, category }) })
export const myCompanies = () => req('/api/me/companies', { headers: phoneH() })

// ---- admin auth ----
export const adminLogin = (email, password) =>
  req('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) })

// ---- admin: companies ----
export const adminListCompanies = () => req('/api/admin/companies', { headers: adminH() })
export const adminPending = () => req('/api/admin/pending-companies', { headers: adminH() })
export const adminCreate = (fd) => req('/api/agencies', { method: 'POST', headers: adminH(), body: fd })
export const adminUpdate = (id, fd) => req(`/api/agencies/${id}`, { method: 'PUT', headers: adminH(), body: fd })
export const adminDelete = (id) => req(`/api/agencies/${id}`, { method: 'DELETE', headers: adminH() })
export const adminApproveCompany = (id) => req(`/api/admin/companies/${id}/approve`, { method: 'POST', headers: adminH() })
export const adminSetStatus = (id, status) =>
  req(`/api/admin/companies/${id}/status`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...adminH() }, body: JSON.stringify({ status }) })
export const adminSetDeadline = (id, deadline) =>
  req(`/api/admin/companies/${id}/deadline`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...adminH() }, body: JSON.stringify({ deadline }) })
export const adminAssign = (id, phone) =>
  req(`/api/admin/companies/${id}/assign`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...adminH() }, body: JSON.stringify({ phone }) })
export const adminUnassign = (id, phone) =>
  req(`/api/admin/companies/${id}/unassign`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...adminH() }, body: JSON.stringify({ phone }) })
export const adminAssignments = (id) => req(`/api/admin/companies/${id}/assignments`, { headers: adminH() })

// ---- admin: reservations ----
export const adminReservations = (status) =>
  req(`/api/admin/reservations${status ? `?status=${status}` : ''}`, { headers: adminH() })
export const adminApproveReservation = (id) =>
  req(`/api/admin/reservations/${id}/approve`, { method: 'POST', headers: adminH() })
export const adminRejectReservation = (id) =>
  req(`/api/admin/reservations/${id}/reject`, { method: 'POST', headers: adminH() })

// ---- admin: templates ----
export const adminTemplates = () => req('/api/admin/templates', { headers: adminH() })
export const adminCreateTemplate = (title, body) =>
  req('/api/admin/templates', { method: 'POST', headers: { 'Content-Type': 'application/json', ...adminH() }, body: JSON.stringify({ title, body }) })
export const adminDeleteTemplate = (id) => req(`/api/admin/templates/${id}`, { method: 'DELETE', headers: adminH() })
