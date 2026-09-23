import { useState, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Upload, X, ImageIcon, Loader2, GripVertical } from 'lucide-react'
import { supabase } from '../lib/supabase'

interface ImageUploaderProps {
  images: string[]
  onChange: (images: string[]) => void
  folder: string
  maxImages?: number
}

export default function ImageUploader({ images, onChange, folder, maxImages = 20 }: ImageUploaderProps) {
  const { t } = useTranslation()
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const uploadFiles = useCallback(async (files: FileList | File[]) => {
    const fileArray = Array.from(files).filter(f => f.type.startsWith('image/'))
    if (fileArray.length === 0) return

    const remaining = maxImages - images.length
    if (remaining <= 0) return
    const toUpload = fileArray.slice(0, remaining)

    setUploading(true)
    const newUrls: string[] = []

    for (const file of toUpload) {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
      const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
      const path = `${folder}/${fileName}`

      const { error } = await supabase.storage.from('hotel-images').upload(path, file, {
        cacheControl: '3600',
        upsert: false,
      })

      if (!error) {
        const { data: urlData } = supabase.storage.from('hotel-images').getPublicUrl(path)
        if (urlData?.publicUrl) {
          newUrls.push(urlData.publicUrl)
        }
      }
    }

    if (newUrls.length > 0) {
      onChange([...images, ...newUrls])
    }
    setUploading(false)
  }, [images, onChange, folder, maxImages])

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    if (e.dataTransfer.files.length > 0) {
      uploadFiles(e.dataTransfer.files)
    }
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(true)
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
  }

  function removeImage(index: number) {
    const updated = images.filter((_, i) => i !== index)
    onChange(updated)
  }

  function handleReorderStart(index: number) {
    setDragIndex(index)
  }

  function handleReorderOver(e: React.DragEvent, index: number) {
    e.preventDefault()
    setDropIndex(index)
  }

  function handleReorderDrop(e: React.DragEvent, index: number) {
    e.preventDefault()
    if (dragIndex === null || dragIndex === index) {
      setDragIndex(null)
      setDropIndex(null)
      return
    }
    const reordered = [...images]
    const [moved] = reordered.splice(dragIndex, 1)
    reordered.splice(index, 0, moved)
    onChange(reordered)
    setDragIndex(null)
    setDropIndex(null)
  }

  function handleReorderEnd() {
    setDragIndex(null)
    setDropIndex(null)
  }

  return (
    <div className="space-y-3">
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => fileInputRef.current?.click()}
        className={`relative border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all duration-200 ${
          dragOver
            ? 'border-primary-400 bg-primary-50'
            : 'border-gray-200 hover:border-primary-300 hover:bg-gray-50'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="hidden"
          onChange={e => e.target.files && uploadFiles(e.target.files)}
        />
        {uploading ? (
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="w-8 h-8 text-primary-500 animate-spin" />
            <p className="text-sm text-gray-600">{t('uploader.uploading')}</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <div className="w-12 h-12 rounded-full bg-primary-50 flex items-center justify-center">
              <Upload className="w-5 h-5 text-primary-600" />
            </div>
            <p className="text-sm font-medium text-gray-700">
              {t('uploader.dropzone')}
            </p>
            <p className="text-xs text-gray-400">
              {t('uploader.hint', { count: images.length, max: maxImages })}
            </p>
          </div>
        )}
      </div>

      {images.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {images.map((url, index) => (
            <div
              key={url}
              draggable
              onDragStart={() => handleReorderStart(index)}
              onDragOver={e => handleReorderOver(e, index)}
              onDrop={e => handleReorderDrop(e, index)}
              onDragEnd={handleReorderEnd}
              className={`group relative aspect-[4/3] rounded-lg overflow-hidden border transition-all duration-150 ${
                dropIndex === index ? 'border-primary-400 scale-95' : 'border-gray-200'
              } ${dragIndex === index ? 'opacity-50' : ''}`}
            >
              <img
                src={url}
                alt={t('uploader.imageAlt', { n: index + 1 })}
                className="w-full h-full object-cover"
                onError={e => {
                  (e.target as HTMLImageElement).src = ''
                  ;(e.target as HTMLImageElement).classList.add('hidden')
                  ;(e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden')
                }}
              />
              <div className="hidden w-full h-full flex items-center justify-center bg-gray-100">
                <ImageIcon className="w-6 h-6 text-gray-300" />
              </div>
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors" />
              <button
                type="button"
                onClick={() => removeImage(index)}
                className="absolute top-1.5 right-1.5 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm"
              >
                <X className="w-3.5 h-3.5" />
              </button>
              <div className="absolute top-1.5 left-1.5 w-6 h-6 bg-white/80 rounded flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-grab">
                <GripVertical className="w-3.5 h-3.5 text-gray-500" />
              </div>
              {index === 0 && (
                <span className="absolute bottom-1.5 left-1.5 px-2 py-0.5 bg-primary-600 text-white text-[10px] font-semibold rounded-full">
                  {t('uploader.cover')}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
