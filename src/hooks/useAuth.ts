// src/hooks/useAuth.ts
import { useState, useEffect } from 'react'
import { authService, type AuthUser } from '../services/authService'

interface UseAuthReturn {
  user: AuthUser | null
  loading: boolean
  signIn: (emailOrUsername: string, password: string) => Promise<void>
  signUp: (email: string, password: string, username: string, color: string) => Promise<void>
  signOut: () => Promise<void>
  resetPassword: (email: string) => Promise<void>
  updateProfile: (username: string, color: string) => Promise<void>
  error: string | null
}

export const useAuth = (): UseAuthReturn => {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Check for existing session on mount
    const checkSession = async () => {
      try {
        const currentUser = await authService.getCurrentUser()
        setUser(currentUser)
      } catch (err: any) {
        console.error('Error checking session:', err)
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }

    checkSession()

    // Listen for auth state changes
    const { data: { subscription } } = authService.onAuthStateChange((user) => {
      setUser(user)
      setLoading(false)
    })

    // Cleanup subscription
    return () => subscription.unsubscribe()
  }, [])

  const signIn = async (emailOrUsername: string, password: string) => {
    try {
      setLoading(true)
      setError(null)
      await authService.signIn(emailOrUsername, password)
      // User state will be updated by the auth state change listener
    } catch (err: any) {
      setError(err.message)
      throw err
    } finally {
      setLoading(false)
    }
  }

  const signUp = async (email: string, password: string, username: string, color: string) => {
    try {
      setLoading(true)
      setError(null)
      await authService.signUp(email, password, username, color)
      // User state will be updated by the auth state change listener
    } catch (err: any) {
      setError(err.message)
      throw err
    } finally {
      setLoading(false)
    }
  }

  const resetPassword = async (email: string) => {
    try {
      setLoading(true)
      setError(null)
      await authService.resetPassword(email)
    } catch (err: any) {
      setError(err.message)
      throw err
    } finally {
      setLoading(false)
    }
  }

  const updateProfile = async (username: string, color: string) => {
    try {
      setLoading(true)
      setError(null)
      await authService.updateProfile(username, color)
      // Refresh user data
      const updatedUser = await authService.getCurrentUser()
      setUser(updatedUser)
    } catch (err: any) {
      setError(err.message)
      throw err
    } finally {
      setLoading(false)
    }
  }

  const signOut = async () => {
    try {
      setLoading(true)
      setError(null)
      await authService.signOut()
      // User state will be updated by the auth state change listener
    } catch (err: any) {
      setError(err.message)
      throw err
    } finally {
      setLoading(false)
    }
  }

  return {
    user,
    loading,
    signIn,
    signUp,
    signOut,
    resetPassword,
    updateProfile,
    error
  }
}