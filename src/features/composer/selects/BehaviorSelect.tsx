import { memo } from 'react'
import type { MessageBehavior } from '../composer-utils.ts'
import { ComposerSelect } from './ComposerSelect.tsx'

/** Picks the delivery mode for the next message sent to a running Pi session. */
export const BehaviorSelect = memo(function BehaviorSelect({ behavior, onChange }: {
  behavior: MessageBehavior
  onChange: (value: MessageBehavior) => void
}) {
  return (
    <ComposerSelect
      ariaLabel='Next message behavior'
      onValueChange={(value) => onChange(value as MessageBehavior)}
      options={[
        { description: 'At the next tool boundary', label: 'Steer', value: 'steer' },
        { description: 'Stop the current turn first', label: 'Interrupt', value: 'interrupt' },
        { description: 'Once Pi stops', label: 'Follow up', value: 'followUp' },
      ]}
      tone='behavior'
      value={behavior}
    />
  )
})
