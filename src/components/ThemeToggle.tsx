import { Moon, Sun } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useTheme } from '@/hooks/useTheme'

export function ThemeToggle() {
  const { resolved, toggle } = useTheme()
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggle}
      title={resolved === 'dark' ? 'Switch to light' : 'Switch to dark'}
      aria-label={resolved === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
    >
      {resolved === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
    </Button>
  )
}
