import { Link, useNavigate, useParams } from 'react-router-dom'
import { AuthView, NeonAuthUIProvider } from '@neondatabase/auth-ui'
import { toast as showToast } from 'react-hot-toast'
import { authClient, neonEnabled } from '../lib/neonAuth'
import AuthLayout from './AuthLayout'

function renderToast({ variant, message }) {
  if (variant === 'error') showToast.error(message)
  else if (variant === 'success') showToast.success(message)
  else showToast(message)
}

function Inner({ children }) {
  const navigate = useNavigate()

  return (
    <NeonAuthUIProvider
      authClient={authClient}
      redirectTo="/dashboard"
      basePath="/auth"
      /* the provider injects its own wrapper div — keep the html/body/#root
         height chain intact so `h-full` pages still fill the viewport */
      className="h-full"
      navigate={(href) => navigate(href)}
      replace={(href) => navigate(href, { replace: true })}
      Link={({ href, ...props }) => <Link to={href} {...props} />}
      toast={renderToast}
    >
      {children}
    </NeonAuthUIProvider>
  )
}

export default function NeonAuthGate({ children }) {
  if (!neonEnabled) return children
  return <Inner>{children}</Inner>
}

export function NeonAuthPage() {
  const { pathname } = useParams()

  return (
    <AuthLayout wide>
      <AuthView path={pathname} />
    </AuthLayout>
  )
}
