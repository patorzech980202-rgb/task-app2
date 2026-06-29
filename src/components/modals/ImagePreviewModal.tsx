"use client"

import { RefObject } from "react"

type ImagePreviewModalProps = {
  previewImage: string
  previewImages: string[]
  previewIndex: number
  setPreviewImage: (value: string | null) => void
  setPreviewImages: (value: string[]) => void
  setPreviewIndex: (value: number) => void
  touchStartX: RefObject<number | null>
}

export default function ImagePreviewModal({
  previewImage,
  previewImages,
  previewIndex,
  setPreviewImage,
  setPreviewImages,
  setPreviewIndex,
  touchStartX,
}: ImagePreviewModalProps) {
  const closePreview = () => {
    setPreviewImage(null)
    setPreviewImages([])
    setPreviewIndex(0)
  }

  const showPrevious = () => {
    const newIndex =
      previewIndex === 0 ? previewImages.length - 1 : previewIndex - 1

    setPreviewIndex(newIndex)
    setPreviewImage(previewImages[newIndex])
  }

  const showNext = () => {
    const newIndex =
      previewIndex === previewImages.length - 1 ? 0 : previewIndex + 1

    setPreviewIndex(newIndex)
    setPreviewImage(previewImages[newIndex])
  }

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/90 p-4"
      onTouchStart={(e) => {
        touchStartX.current = e.touches[0].clientX
      }}
      onTouchEnd={(e) => {
        if (touchStartX.current === null) return

        const touchEndX = e.changedTouches[0].clientX
        const diff = touchStartX.current - touchEndX

        if (Math.abs(diff) > 50 && previewImages.length > 1) {
          if (diff > 0) {
            showNext()
          } else {
            showPrevious()
          }
        }

        touchStartX.current = null
      }}
    >
      <button
        onClick={closePreview}
        className="absolute right-4 top-4 rounded-full bg-white px-4 py-2 text-sm font-bold text-black"
      >
        Zamknij
      </button>

      <div className="mb-3 text-sm font-semibold text-white">
        Zdjęcie {previewIndex + 1} z {previewImages.length}
      </div>

      <div className="flex w-full items-center justify-center gap-3">
        <button
          onClick={showPrevious}
          className="rounded-full bg-white/90 px-4 py-3 text-xl font-bold text-black"
        >
          ‹
        </button>

        <img
          src={previewImage}
          alt="Podgląd zdjęcia"
          className="max-h-[80vh] max-w-[75vw] rounded-2xl object-contain"
        />

        <button
          onClick={showNext}
          className="rounded-full bg-white/90 px-4 py-3 text-xl font-bold text-black"
        >
          ›
        </button>
      </div>
    </div>
  )
}