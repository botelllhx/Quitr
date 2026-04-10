/**
 * Helpers para chamadas à API Fastify a partir de Server Components (Next.js).
 * Para Client Components, use useAuth() + fetch diretamente.
 */
import { auth } from '@clerk/nextjs/server'

const API_URL = process.env.API_URL ?? 'http://localhost:3001'

async function getAuthHeaders() {
  const { getToken } = await auth()
  const token = await getToken()
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token ?? ''}`,
  }
}

export async function apiGet<T>(path: string): Promise<T> {
  const headers = await getAuthHeaders()
  const res = await fetch(`${API_URL}${path}`, {
    headers,
    cache: 'no-store',
  })
  if (!res.ok) {
    const body = await res.json().catch(() => null) as { error?: { message?: string } } | null
    throw new Error(body?.error?.message ?? `HTTP ${res.status} em GET ${path}`)
  }
  return res.json() as Promise<T>
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const headers = await getAuthHeaders()
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => null) as { error?: { message?: string } } | null
    throw new Error(err?.error?.message ?? `HTTP ${res.status} em POST ${path}`)
  }
  return res.json() as Promise<T>
}

export async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  const headers = await getAuthHeaders()
  const res = await fetch(`${API_URL}${path}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => null) as { error?: { message?: string } } | null
    throw new Error(err?.error?.message ?? `HTTP ${res.status} em PATCH ${path}`)
  }
  return res.json() as Promise<T>
}

export async function apiDelete(path: string): Promise<void> {
  const headers = await getAuthHeaders()
  const res = await fetch(`${API_URL}${path}`, { method: 'DELETE', headers })
  if (!res.ok && res.status !== 204) {
    const err = await res.json().catch(() => null) as { error?: { message?: string } } | null
    throw new Error(err?.error?.message ?? `HTTP ${res.status} em DELETE ${path}`)
  }
}
