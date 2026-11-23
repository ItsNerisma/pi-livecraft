import * as Select from '@radix-ui/react-select'
import { memo, type RefObject } from 'react'

/** Generic Radix-based select dropdown shared by all composer toolbar controls. */
export const ComposerSelect = memo(function ComposerSelect(
  {
    ariaLabel,
    disabled,
    onToggleFavorite,
    onOpenChange,
    onValueChange,
    open,
    onOptionPointerMove,
    onOptionsPointerLeave,
    options,
    placeholder,
    tone,
    triggerRef,
    loading,
    value,
  }: {
    ariaLabel: string
    disabled?: boolean
    onToggleFavorite?: (value: string) => void
    onValueChange: (value: string) => void
    options: {
      description?: string
      favorite?: boolean
      kind?: 'action'
      label: string
      value: string
    }[]
    placeholder?: string
    tone: 'agent' | 'behavior' | 'command' | 'improve' | 'model' | 'prompt' | 'thinking'
    value: string
    loading?: boolean
    open?: boolean
    onOpenChange?: (open: boolean) => void
    onOptionPointerMove?: (value: string) => void
    onOptionsPointerLeave?: () => void
    triggerRef?: RefObject<HTMLButtonElement | null>
  },
) {
  const selectedLabel = options.find((option) => option.value === value)?.label

  return (
    <Select.Root
      disabled={disabled}
      onOpenChange={onOpenChange}
      open={open}
      onValueChange={onValueChange}
      value={value}
    >
      <Select.Trigger aria-label={ariaLabel} className={`composer-select ${tone}`} ref={triggerRef}>
        {loading
          ? <span aria-hidden='true' className='composer-select-spinner' />
          : <ComposerSelectIcon tone={tone} />}
        <Select.Value placeholder={placeholder}>{selectedLabel}</Select.Value>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content
          className={`composer-select-content ${tone}`}
          position='popper'
          sideOffset={7}
        >
          <Select.Viewport onPointerLeave={onOptionsPointerLeave}>
            {options.map((option) => (
              <Select.Item
                className={`composer-select-option${option.kind === 'action' ? ' action' : ''}`}
                key={option.value}
                onPointerMove={() => onOptionPointerMove?.(option.value)}
                value={option.value}
              >
                <Select.ItemText>
                  <span className='composer-select-option-copy'>
                    <span>{option.label}</span>
                    {option.description && <small>{option.description}</small>}
                  </span>
                </Select.ItemText>
                <span className='composer-select-option-actions'>
                  <Select.ItemIndicator aria-hidden='true'>✓</Select.ItemIndicator>
                  {onToggleFavorite && (
                    <button
                      aria-label={`Toggle favorite ${option.label}`}
                      aria-pressed={option.favorite}
                      className={`composer-select-favorite${option.favorite ? ' active' : ''}`}
                      onClick={(event) => {
                        event.stopPropagation()
                        onToggleFavorite(option.value)
                      }}
                      onPointerDown={(event) => {
                        event.preventDefault()
                        event.stopPropagation()
                      }}
                      onPointerUp={(event) => event.stopPropagation()}
                      type='button'
                    >
                      ★
                    </button>
                  )}
                </span>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  )
})

/** Uses consistent SVG pictograms independent of a font or emoji set. */
function ComposerSelectIcon(
  { tone }: {
    tone: 'agent' | 'behavior' | 'command' | 'improve' | 'model' | 'prompt' | 'thinking'
  },
) {
  if (tone === 'model')
    return (
      <svg aria-hidden='true' className='composer-select-icon' viewBox='0 0 16 16'>
        <path
          d='m2.5 5 5.5-2.5L13.5 5 8 7.5 2.5 5Zm0 3L8 10.5 13.5 8M2.5 11 8 13.5l5.5-2.5'
          fill='none'
          stroke='currentColor'
          strokeLinejoin='round'
          strokeWidth='1.4'
        />
      </svg>
    )
  if (tone === 'prompt')
    return (
      <svg aria-hidden='true' className='composer-select-icon' viewBox='0 0 16 16'>
        <path
          d='M3 2.5h10v11H3zM5.2 5.5h5.6M5.2 8h5.6M5.2 10.5h3.2'
          fill='none'
          stroke='currentColor'
          strokeLinecap='round'
          strokeLinejoin='round'
          strokeWidth='1.4'
        />
      </svg>
    )
  if (tone === 'thinking')
    return (
      <svg aria-hidden='true' className='composer-select-icon' viewBox='0 0 16 16'>
        <path
          d='m8 2 1.4 4.6L14 8l-4.6 1.4L8 14 6.6 9.4 2 8l4.6-1.4L8 2Z'
          fill='none'
          stroke='currentColor'
          strokeLinejoin='round'
          strokeWidth='1.4'
        />
      </svg>
    )
  return <span className='composer-select-icon' aria-hidden='true' />
}
