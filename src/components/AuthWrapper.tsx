// src/components/AuthWrapper.tsx
import React, { useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { Users, Mail, Lock, Eye, EyeOff, ArrowRight, Settings, LogOut, Edit, Check, X } from 'lucide-react'

interface AuthWrapperProps {
  children: React.ReactNode
}

const userColors = [
  { name: 'Warm Orange', value: '#F97316', bg: 'bg-orange-500' },
  { name: 'Amber', value: '#F59E0B', bg: 'bg-amber-500' },
  { name: 'Red Orange', value: '#EA580C', bg: 'bg-orange-600' },
  { name: 'Yellow', value: '#EAB308', bg: 'bg-yellow-500' },
  { name: 'Emerald Green', value: '#10B981', bg: 'bg-emerald-500' },
  { name: 'Sky Blue', value: '#0EA5E9', bg: 'bg-sky-500' },
  { name: 'Slate', value: '#64748B', bg: 'bg-slate-500' },
  { name: 'Rose', value: '#F43F5E', bg: 'bg-rose-500' },
]

const AuthWrapper: React.FC<AuthWrapperProps> = ({ children }) => {
  const { user, loading, signIn, signUp, signOut, error, resetPassword, updateProfile } = useAuth()
  const [mode, setMode] = useState<'signin' | 'signup' | 'forgot' | 'profile'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [selectedColor, setSelectedColor] = useState(userColors[0])
  const [showPassword, setShowPassword] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [resetSent, setResetSent] = useState(false)
  const [emailSent, setEmailSent] = useState(false)
  const [showProfileMenu, setShowProfileMenu] = useState(false)
  
  // Profile editing states
  const [editingProfile, setEditingProfile] = useState(false)
  const [newUsername, setNewUsername] = useState('')
  const [newColor, setNewColor] = useState(userColors[0])

  // Show loading spinner while checking auth state
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-amber-50 via-orange-50 to-red-50">
        <div className="relative">
          <div className="animate-spin rounded-full h-16 w-16 border-4 border-orange-200 border-t-orange-500"></div>
          <div className="absolute inset-0 rounded-full h-16 w-16 border-4 border-transparent border-r-amber-500 animate-spin animation-delay-150"></div>
        </div>
      </div>
    )
  }

  // Initialize profile editing values
  const initializeProfileEdit = () => {
    setNewUsername(user?.username || user?.name || '')
    const currentColor = userColors.find(c => c.value === user?.color) || userColors[0]
    setNewColor(currentColor)
  }

  // If user is authenticated, render the app
  if (user) {
    return (
      <div>
        {/* Enhanced user info bar with LCS-style warm orange */}
        <div className="bg-gradient-to-r from-orange-500/90 to-amber-500/90 backdrop-blur-sm border-b border-orange-200 px-6 py-3 flex justify-between items-center shadow-lg">
          <div className="flex items-center space-x-3">
            <div 
              className="w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold shadow-lg ring-2 ring-white/30"
              style={{ backgroundColor: user.color || '#F97316' }}
            >
              {user.name?.charAt(0).toUpperCase() || user.email?.charAt(0).toUpperCase()}
            </div>
            <div>
              <span className="text-white font-semibold">{user.name || user.email}</span>
              <div className="text-orange-100 text-xs">{user.email}</div>
            </div>
          </div>
          
          <div className="flex items-center space-x-2">
            {/* Profile Settings Dropdown */}
            <div className="relative">
              <button
                onClick={() => setShowProfileMenu(!showProfileMenu)}
                className="text-white hover:text-orange-100 transition-colors duration-200 p-2 rounded-lg hover:bg-white/10"
                title="Profile Settings"
              >
                <Settings className="w-5 h-5" />
              </button>
              
              {showProfileMenu && (
                <div className="absolute right-0 top-12 bg-white rounded-xl shadow-xl border border-orange-100 py-2 min-w-48 z-50">
                  <button
                    onClick={() => {
                      initializeProfileEdit()
                      setEditingProfile(true)
                      setShowProfileMenu(false)
                    }}
                    className="w-full px-4 py-2 text-left text-gray-700 hover:bg-orange-50 flex items-center space-x-2"
                  >
                    <Edit className="w-4 h-4" />
                    <span>Edit Profile</span>
                  </button>
                  <hr className="my-2 border-orange-100" />
                  <button
                    onClick={signOut}
                    className="w-full px-4 py-2 text-left text-red-600 hover:bg-red-50 flex items-center space-x-2"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Sign Out</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Profile Edit Modal */}
        {editingProfile && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
              <h3 className="text-xl font-semibold text-gray-800 mb-4">Edit Profile</h3>
              
              <div className="space-y-4">
                {/* Username */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Username</label>
                  <input
                    type="text"
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                    placeholder="Enter new username"
                  />
                </div>

                {/* Color Picker */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">Choose Your Color</label>
                  <div className="grid grid-cols-4 gap-3">
                    {userColors.map((color) => (
                      <button
                        key={color.value}
                        type="button"
                        onClick={() => setNewColor(color)}
                        className={`relative w-full h-12 rounded-lg transition-all duration-200 ${color.bg} ${
                          newColor.value === color.value 
                            ? 'ring-2 ring-gray-800 ring-offset-2 scale-110' 
                            : 'hover:scale-105'
                        }`}
                      >
                        {newColor.value === color.value && (
                          <div className="absolute inset-0 flex items-center justify-center">
                            <Check className="w-4 h-4 text-white" />
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-gray-500 mt-2">Selected: {newColor.name}</p>
                </div>
              </div>

              <div className="flex space-x-3 mt-6">
                <button
                  onClick={async () => {
                    try {
                      setIsSubmitting(true)
                      await updateProfile(newUsername, newColor.value)
                      setEditingProfile(false)
                    } catch (err) {
                      console.error('Profile update error:', err)
                    } finally {
                      setIsSubmitting(false)
                    }
                  }}
                  disabled={isSubmitting}
                  className="flex-1 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 text-white font-semibold py-2 px-4 rounded-lg transition-all duration-200 flex items-center justify-center space-x-2"
                >
                  {isSubmitting ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white/30 border-t-white"></div>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Save</span>
                    </>
                  )}
                </button>
                <button
                  onClick={() => setEditingProfile(false)}
                  className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-2 px-4 rounded-lg transition-colors duration-200 flex items-center justify-center space-x-2"
                >
                  <X className="w-4 h-4" />
                  <span>Cancel</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {children}
      </div>
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    try {
      setIsSubmitting(true)
      
      if (mode === 'forgot') {
        await resetPassword(email)
        setResetSent(true)
        return
      }
      
      if (mode === 'signup') {
        if (!email || !password || !username) return
        await signUp(email, password, username, selectedColor.value)
        setEmailSent(true)
      } else {
        if (!email || !password) return
        await signIn(email, password)
      }
    } catch (err) {
      console.error('Auth error:', err)
    } finally {
      setIsSubmitting(false)
    }
  }

  const resetForm = () => {
    setEmail('')
    setPassword('')
    setUsername('')
    setSelectedColor(userColors[0])
    setResetSent(false)
    setEmailSent(false)
  }

  const switchMode = (newMode: 'signin' | 'signup' | 'forgot') => {
    setMode(newMode)
    resetForm()
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-red-50 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Animated background elements - warm orange theme */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 rounded-full bg-orange-400/20 blur-3xl animate-pulse"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 rounded-full bg-amber-400/20 blur-3xl animate-pulse animation-delay-1000"></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full bg-orange-300/10 blur-3xl animate-pulse animation-delay-2000"></div>
        
        {/* Subtle pattern overlay */}
        <div className="absolute inset-0 bg-gradient-to-br from-orange-100/30 to-transparent"></div>
      </div>

      <div className="relative z-10 w-full max-w-md">
        {/* Title Section */}
        <div className="text-center mb-8 animate-fade-in">
          <div className="flex items-center justify-center mb-6">
            <div className="relative">
              <div className="w-20 h-20 bg-gradient-to-br from-orange-400 to-amber-500 rounded-2xl flex items-center justify-center shadow-2xl">
                <Users className="w-10 h-10 text-white" />
              </div>
              <div className="absolute -top-2 -right-2 w-6 h-6 bg-gradient-to-br from-amber-400 to-orange-500 rounded-full animate-pulse"></div>
            </div>
          </div>
          <h1 className="text-4xl font-bold text-gray-800 mb-2 tracking-tight">
            SDR LEAD ROTATION
          </h1>
          <h2 className="text-2xl font-semibold bg-gradient-to-r from-orange-600 to-amber-600 bg-clip-text text-transparent mb-4">
            INTERFACE
          </h2>
          <p className="text-gray-600 text-sm">
            {mode === 'signin' && 'Welcome back! Sign in to continue'}
            {mode === 'signup' && 'Join the team! Create your account'}
            {mode === 'forgot' && 'Reset your password'}
          </p>
        </div>

        {/* Auth Form */}
        <div className="bg-white/80 backdrop-blur-lg rounded-2xl border border-orange-200/50 p-8 shadow-2xl animate-slide-up">
          {emailSent ? (
            <div className="text-center">
              <div className="w-16 h-16 bg-gradient-to-br from-orange-100 to-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Mail className="w-8 h-8 text-orange-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-800 mb-2">Check Your Email</h3>
              <p className="text-gray-600 mb-6">We've sent a confirmation link to <strong>{email}</strong>. Please check your email and click the link to activate your account.</p>
              <button
                onClick={() => switchMode('signin')}
                className="text-orange-600 hover:text-orange-700 transition-colors duration-200 font-medium"
              >
                Back to Sign In
              </button>
            </div>
          ) : resetSent ? (
            <div className="text-center">
              <div className="w-16 h-16 bg-gradient-to-br from-green-100 to-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Mail className="w-8 h-8 text-green-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-800 mb-2">Password Reset Sent</h3>
              <p className="text-gray-600 mb-6">We've sent a password reset link to <strong>{email}</strong></p>
              <button
                onClick={() => switchMode('signin')}
                className="text-orange-600 hover:text-orange-700 transition-colors duration-200 font-medium"
              >
                Back to Sign In
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Email Field */}
              <div className="relative">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {mode === 'signin' ? 'Email or Username' : 'Email Address'}
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type={mode === 'forgot' ? 'email' : 'text'}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-12 pr-4 py-3 bg-white/80 border border-orange-200 rounded-xl text-gray-800 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all duration-200"
                    placeholder={mode === 'signin' ? 'Enter email or username' : 'Enter your email'}
                    required
                  />
                </div>
              </div>

              {/* Username Field (Sign Up Only) */}
              {mode === 'signup' && (
                <div className="relative">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Username
                  </label>
                  <div className="relative">
                    <Users className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="w-full pl-12 pr-4 py-3 bg-white/80 border border-orange-200 rounded-xl text-gray-800 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all duration-200"
                      placeholder="Choose a username"
                      required
                    />
                  </div>
                </div>
              )}

              {/* Password Field */}
              {mode !== 'forgot' && (
                <div className="relative">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full pl-12 pr-12 py-3 bg-white/80 border border-orange-200 rounded-xl text-gray-800 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all duration-200"
                      placeholder="Enter your password"
                      required
                      minLength={6}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors duration-200"
                    >
                      {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                </div>
              )}

              {/* Color Picker (Sign Up Only) */}
              {mode === 'signup' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-3">
                    Choose Your Color
                  </label>
                  <div className="grid grid-cols-4 gap-3">
                    {userColors.map((color) => (
                      <button
                        key={color.value}
                        type="button"
                        onClick={() => setSelectedColor(color)}
                        className={`relative w-full h-12 rounded-lg transition-all duration-200 ${color.bg} ${
                          selectedColor.value === color.value 
                            ? 'ring-2 ring-orange-600 ring-offset-2 scale-110' 
                            : 'hover:scale-105'
                        }`}
                      >
                        {selectedColor.value === color.value && (
                          <div className="absolute inset-0 flex items-center justify-center">
                            <div className="w-3 h-3 bg-white rounded-full"></div>
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-gray-600 mt-2">Selected: {selectedColor.name}</p>
                </div>
              )}

              {/* Error Message */}
              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">
                  {error}
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 text-white font-semibold py-3 px-6 rounded-xl transition-all duration-200 transform hover:scale-105 disabled:opacity-50 disabled:hover:scale-100 flex items-center justify-center space-x-2 shadow-lg"
              >
                {isSubmitting ? (
                  <div className="animate-spin rounded-full h-5 w-5 border-2 border-white/30 border-t-white"></div>
                ) : (
                  <>
                    <span>
                      {mode === 'signin' && 'Sign In'}
                      {mode === 'signup' && 'Create Account'}
                      {mode === 'forgot' && 'Send Reset Link'}
                    </span>
                    <ArrowRight className="w-5 h-5" />
                  </>
                )}
              </button>
            </form>
          )}

          {/* Mode Switcher */}
          {!resetSent && !emailSent && (
            <div className="mt-6 text-center space-y-2">
              {mode === 'signin' && (
                <>
                  <button
                    onClick={() => switchMode('signup')}
                    className="text-orange-600 hover:text-orange-700 transition-colors duration-200 text-sm font-medium"
                  >
                    Don't have an account? <span className="font-semibold">Sign Up</span>
                  </button>
                  <br />
                  <button
                    onClick={() => switchMode('forgot')}
                    className="text-gray-500 hover:text-orange-600 transition-colors duration-200 text-sm"
                  >
                    Forgot your password?
                  </button>
                </>
              )}
              {mode === 'signup' && (
                <button
                  onClick={() => switchMode('signin')}
                  className="text-orange-600 hover:text-orange-700 transition-colors duration-200 text-sm font-medium"
                >
                  Already have an account? <span className="font-semibold">Sign In</span>
                </button>
              )}
              {mode === 'forgot' && (
                <button
                  onClick={() => switchMode('signin')}
                  className="text-orange-600 hover:text-orange-700 transition-colors duration-200 text-sm font-medium"
                >
                  Back to <span className="font-semibold">Sign In</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default AuthWrapper