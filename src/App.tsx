import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { Login } from '@/pages/Login'
import { Projects } from '@/pages/Projects'
import { Project } from '@/pages/Project'

export default function App() {
  const { session, profile, loading, isOwner } = useAuth()

  if (loading) {
    return (
      <div className="grid h-full place-items-center bg-ground text-ink-3">Loading…</div>
    )
  }
  if (!session) return <Login />

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Projects name={profile?.name ?? ''} />} />
        <Route
          path="/p/:id"
          element={<Project isOwner={isOwner} profileId={profile?.id ?? ''} />}
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
