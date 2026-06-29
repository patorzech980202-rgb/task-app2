"use client"

type TaskImage = {
  id: number
  task_id: number
  image_url: string
  file_path?: string | null
  file_type?: string | null
}

type MediaGalleryProps = {
  attachments: TaskImage[]
  signedImageUrls: Record<number, string>
  setPreviewImages: (value: string[]) => void
  setPreviewIndex: (value: number) => void
  setPreviewImage: (value: string | null) => void
}

export default function MediaGallery({
  attachments,
  signedImageUrls,
  setPreviewImages,
  setPreviewIndex,
  setPreviewImage,
}: MediaGalleryProps) {
  const imagesOnly = attachments.filter(
    (item) => !item.file_type || item.file_type.startsWith("image/")
  )

  const videosOnly = attachments.filter((item) =>
    item.file_type?.startsWith("video/")
  )

  const allImageUrls = imagesOnly.map(
    (item) => signedImageUrls[item.id] || item.image_url
  )

  if (attachments.length === 0) return null

  return (
    <div className="mt-3 space-y-3">
      {imagesOnly.length > 0 && (
        <div className="flex gap-2 pb-1">
          {imagesOnly.slice(0, 3).map((img, index) => {
            const currentImage = signedImageUrls[img.id] || img.image_url
            const remainingCount = imagesOnly.length - 3

            return (
              <button
                key={img.id}
                type="button"
                onClick={() => {
                  setPreviewImages(allImageUrls)
                  setPreviewIndex(index)
                  setPreviewImage(currentImage)
                }}
                className="relative shrink-0"
              >
                <img
                  src={currentImage}
                  alt="Zdjęcie do zadania"
                  className="h-24 w-24 rounded-2xl border border-stone-200 object-cover shadow-sm"
                />

                {index === 2 && remainingCount > 0 && (
                  <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/60 text-lg font-bold text-white">
                    +{remainingCount}
                  </div>
                )}
              </button>
            )
          })}
        </div>
      )}

      {videosOnly.length > 0 && (
        <div className="space-y-2">
          {videosOnly.map((video) => {
            const videoUrl = signedImageUrls[video.id] || video.image_url

            return (
              <video
                key={video.id}
                src={videoUrl}
                controls
                className="w-full rounded-2xl border border-stone-200 shadow-sm"
              />
            )
          })}
        </div>
      )}
    </div>
  )
}