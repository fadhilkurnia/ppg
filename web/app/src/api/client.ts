// Back-compat re-export. The canonical API client now lives at @/lib/api so it
// can be reused by sitrac-v3 modules that get ported in. Existing GNRS modules
// (api/auth, api/students, api/teachers, api/stats) continue to import from
// './client' unchanged.
export { ApiError, apiFetch, getToken, setToken } from '@/lib/api'
