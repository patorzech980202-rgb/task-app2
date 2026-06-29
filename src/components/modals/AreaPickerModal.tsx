import { supabase } from "../../../lib/supabase"

type Area = {
  id: number
  hotel_id: number
  name: string
}

type Status = "na stanowisku" | "poza stanowiskiem"

type Profile = {
  id: string
  name: string
  department_id: number
  hotel_id: number
  status: Status
  role: "pracownik" | "kierownik" | "administrator"
  current_area_id: number | null
  current_area_ids: number[] | null
}

type AreaPickerModalProps = {
  profile: Profile
  areas: Area[]
  setProfile: (profile: Profile) => void
  setShowAreaPicker: (value: boolean) => void
}

export default function AreaPickerModal({
  profile,
  areas,
  setProfile,
  setShowAreaPicker,
}: AreaPickerModalProps) {
  const hotelAreas = areas.filter(
    (area) => area.hotel_id === profile.hotel_id && area.name !== "Ogólne"
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-xl">
        <h2 className="text-lg font-bold text-stone-900">
          Zmień obszary pracy
        </h2>

        <div className="mt-4 space-y-2">
          {hotelAreas.map((area) => {
            const checked = profile.current_area_ids?.includes(area.id)

            return (
              <button
                key={area.id}
                type="button"
                onClick={async () => {
                  const current = profile.current_area_ids || []

                  const updated = checked
                    ? current.filter((id) => id !== area.id)
                    : [...current, area.id]

                  await supabase
                    .from("profiles")
                    .update({
                      current_area_ids: updated,
                      current_area_id: updated[0] || null,
                    })
                    .eq("id", profile.id)

                  setProfile({
                    ...profile,
                    current_area_ids: updated,
                    current_area_id: updated[0] || null,
                  })
                }}
                className={`w-full rounded-2xl border p-3 text-left text-sm font-semibold ${
                  checked
                    ? "border-emerald-400 bg-emerald-50 text-emerald-800"
                    : "border-stone-300 bg-stone-50 text-stone-900"
                }`}
              >
                {checked ? "✅" : "⬜"} {area.name}
              </button>
            )
          })}
        </div>

        <button
          onClick={() => setShowAreaPicker(false)}
          className="mt-4 w-full rounded-2xl bg-stone-900 py-3 text-sm font-bold text-white"
        >
          Gotowe
        </button>
      </div>
    </div>
  )
}