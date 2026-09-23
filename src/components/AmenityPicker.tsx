import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, X } from 'lucide-react'
import { amenityLabel } from '../lib/amenities'

const COMMON_AMENITIES = [
  'WiFi', 'Parking', 'Pool', 'Gym', 'Spa', 'Restaurant',
  'Bar', 'Room Service', 'Breakfast', 'Air Conditioning',
  'Laundry', 'Airport Shuttle', 'Business Center', 'Pet Friendly',
  'Kids Club', 'Beach Access', 'Balcony', 'Kitchen',
  'TV', 'Safe', 'Mini Bar', 'Hair Dryer',
  'Iron', 'Coffee Maker', 'Elevator', 'Wheelchair Accessible',
  '24h Reception', 'Garden', 'Terrace', 'Hot Tub',
]

interface AmenityPickerProps {
  amenities: string[]
  onChange: (amenities: string[]) => void
}

export default function AmenityPicker({ amenities, onChange }: AmenityPickerProps) {
  const { t } = useTranslation()
  const [customValue, setCustomValue] = useState('')

  function toggle(amenity: string) {
    if (amenities.includes(amenity)) {
      onChange(amenities.filter(a => a !== amenity))
    } else {
      onChange([...amenities, amenity])
    }
  }

  function addCustom() {
    const value = customValue.trim()
    if (value && !amenities.includes(value)) {
      onChange([...amenities, value])
    }
    setCustomValue('')
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault()
      addCustom()
    }
  }

  return (
    <div className="space-y-3">
      {/* Selected amenities */}
      {amenities.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {amenities.map(a => (
            <span
              key={a}
              className="inline-flex items-center gap-1 px-2.5 py-1 bg-primary-50 text-primary-700 rounded-lg text-xs font-medium"
            >
              {amenityLabel(t, a)}
              <button type="button" aria-label={t('common.delete')} onClick={() => toggle(a)} className="hover:text-primary-900">
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Common amenities grid */}
      <div className="flex flex-wrap gap-1.5">
        {COMMON_AMENITIES.filter(a => !amenities.includes(a)).map(a => (
          <button
            key={a}
            type="button"
            onClick={() => toggle(a)}
            className="px-2.5 py-1 border border-gray-200 text-gray-600 rounded-lg text-xs font-medium hover:border-primary-300 hover:text-primary-600 hover:bg-primary-50/50 transition-colors"
          >
            {amenityLabel(t, a)}
          </button>
        ))}
      </div>

      {/* Custom amenity input */}
      <div className="flex gap-2">
        <input
          type="text"
          value={customValue}
          onChange={e => setCustomValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t('amenities.addCustom')}
          className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
        <button
          type="button"
          onClick={addCustom}
          disabled={!customValue.trim()}
          aria-label={t('owner.add')}
          className="px-3 py-2 bg-gray-100 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
