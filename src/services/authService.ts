// src/services/authService.ts
import { supabase } from '../lib/supabase'
import type { User } from '@supabase/supabase-js'

export interface AuthUser {
  id: string
  email: string
  name?: string
  username?: string
  color?: string
}

class AuthService {
  // Sign in with email/username and password
  async signIn(emailOrUsername: string, password: string) {
    // First try to sign in with email
    let { data, error } = await supabase.auth.signInWithPassword({
      email: emailOrUsername,
      password
    })

    // If it fails and looks like a username (no @), try to find the email
    if (error && !emailOrUsername.includes('@')) {
      try {
        // Look up the user by username in a users table or user metadata
        // For now, we'll assume the username might be stored in user_metadata
        // This is a simplified approach - you might want a separate users table
        const { data: users } = await supabase
          .from('profiles') // You might need to create this table
          .select('email')
          .eq('username', emailOrUsername)
          .single()

        if (users?.email) {
          const { data: retryData, error: retryError } = await supabase.auth.signInWithPassword({
            email: users.email,
            password
          })
          data = retryData
          error = retryError
        }
      } catch (lookupError) {
        // If lookup fails, keep original error
      }
    }

    if (error) throw error
    return data
  }

  // Sign up with email, password, username, and color
  async signUp(email: string, password: string, username: string, color: string) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          username,
          color,
          display_name: username
        }
      }
    })

    if (error) throw error

    // Optionally create a profile record for easier username lookups
    if (data.user) {
      try {
        await supabase.from('profiles').upsert({
          id: data.user.id,
          email,
          username,
          color,
          created_at: new Date().toISOString()
        })
      } catch (profileError) {
        // Profile creation failed but auth succeeded
        console.warn('Profile creation failed:', profileError)
      }
    }

    return data
  }

  // Reset password
  async resetPassword(email: string) {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`
    })
    
    if (error) throw error
  }

  // Update user profile
  async updateProfile(username: string, color: string) {
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) throw new Error('No authenticated user found')

    // Update auth user metadata
    const { error: authError } = await supabase.auth.updateUser({
      data: {
        username,
        color,
        display_name: username
      }
    })

    if (authError) throw authError

    // Also update profiles table if it exists
    try {
      await supabase.from('profiles').upsert({
        id: user.id,
        email: user.email,
        username,
        color,
        updated_at: new Date().toISOString()
      })
    } catch (profileError) {
      console.warn('Profile table update failed:', profileError)
    }
  }

  // Sign out
  async signOut() {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
  }

  // Get current user with enhanced data
  async getCurrentUser(): Promise<AuthUser | null> {
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) return null
    
    return {
      id: user.id,
      email: user.email || '',
      name: user.user_metadata?.display_name || user.user_metadata?.username || user.email,
      username: user.user_metadata?.username,
      color: user.user_metadata?.color || '#F97316'
    }
  }

  // Get current session
  async getSession() {
    const { data: { session } } = await supabase.auth.getSession()
    return session
  }

  // Listen for auth state changes
  onAuthStateChange(callback: (user: AuthUser | null) => void) {
    return supabase.auth.onAuthStateChange(async (event, session) => {
      const user = session?.user
      
      if (user) {
        callback({
          id: user.id,
          email: user.email || '',
          name: user.user_metadata?.display_name || user.user_metadata?.username || user.email,
          username: user.user_metadata?.username,
          color: user.user_metadata?.color || '#F97316'
        })
      } else {
        callback(null)
      }
    })
  }
}

export const authService = new AuthService()