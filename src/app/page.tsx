"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";
import AppHeader from "../components/layout/AppHeader";
import AreaPickerModal from "../components/modals/AreaPickerModal";
import ImagePreviewModal from "../components/modals/ImagePreviewModal";
import MediaGallery from "../components/tasks/MediaGallery";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }

  return outputArray;
}

type Task = {
  id: number;
  title: string;
  authorId: string;
  assigneeId: string | null;
  departmentId: number;
  hotel_id: number | null;
  done: boolean;
  completedBy: string | null;
  completedAt: string | null;
  createdAt: string;
  archivedBy: string[];
  area_id: number | null;
  area_ids: number[] | null;
  history_archived_at: string | null;
  history_archived_by: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
};

type TaskImage = {
  id: number;
  task_id: number;
  image_url: string;
  file_path?: string | null;
  file_type?: string | null;
};

type TaskComment = {
  id: number;
  task_id: number;
  author_id: string;
  message: string;
  created_at: string;
};

type Area = {
  id: number;
  hotel_id: number;
  name: string;
};

type Status = "na stanowisku" | "poza stanowiskiem";

type Profile = {
  id: string;
  name: string;
  surname?: string;
  department_id: number;
  hotel_id: number;
  status: Status;
  role: "pracownik" | "kierownik_hotelu" | "kierownik" | "administrator"| "admin";
  push_token?: string | null;
  current_area_id: number | null;
  current_area_ids: number[] | null;
};

type SectionKey = "otrzymane" | "wysłane" | "archiwum";

export default function Home() {
  const [selectedTargetType, setSelectedTargetType] = useState<
    "department" | "housekeeping_manager"
  >("department");
  const [selectedDepartment, setSelectedDepartment] = useState(1);
  const [selectedRecipientType, setSelectedRecipientType] = useState<
    "team" | "hotel_manager"
  >("team");
  const [selectedArea, setSelectedArea] = useState<number | null>(null);
  const [selectedAreas, setSelectedAreas] = useState<number[]>([]);
  const [selectedHotel, setSelectedHotel] = useState(1);
  const [filterHotel, setFilterHotel] = useState(0);
  const [showForm, setShowForm] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [showAreaPicker, setShowAreaPicker] = useState(false);
  const [openSections, setOpenSections] = useState({
    otrzymane: true,
    wysłane: false,
    archiwum: false,
  });

  const departments = [
    { id: 1, name: "POKOJOWE" },
    { id: 2, name: "KONSERWATORZY" },
    { id: 3, name: "RECEPCJA" },
  ];

  const hotels = [
    { id: 1, name: "Olimp 1" },
    { id: 2, name: "Olimp 2" },
    { id: 3, name: "Olimp 3" },
    { id: 4, name: "Olimp 4" },
  ];

  const [profile, setProfile] = useState<Profile | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [taskImages, setTaskImages] = useState<TaskImage[]>([]);
  const [taskComments, setTaskComments] = useState<TaskComment[]>([]);
  const [openCommentsTaskId, setOpenCommentsTaskId] = useState<number | null>(
  null,
);

const [commentDraft, setCommentDraft] = useState("");
  const [signedImageUrls, setSignedImageUrls] = useState<
    Record<number, string>
  >({});
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [newTask, setNewTask] = useState("");
  const [selectedAttachments, setSelectedAttachments] = useState<File[]>([]);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [previewImages, setPreviewImages] = useState<string[]>([]);
  const [previewIndex, setPreviewIndex] = useState(0);
  const touchStartX = useRef<number | null>(null);
  const [loading, setLoading] = useState(true);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const getHotelName = (hotelId: number | null) => {
    return hotels.find((h) => h.id === hotelId)?.name || "Brak hotelu";
  };
  const getAreasForHotel = (hotelId: number | null) => {
    if (!hotelId) return [];

    return areas.filter((area) => area.hotel_id === hotelId);
  };

  const getGeneralAreaId = (hotelId: number | null) => {
    return (
      getAreasForHotel(hotelId).find((area) => area.name === "Ogólne")?.id ||
      null
    );
  };

  const getAreaName = (areaId: number | null) => {
    if (!areaId) return "Bez obszaru";

    return areas.find((area) => area.id === areaId)?.name || "Bez obszaru";
  };
  const getTaskAreaNames = (task: Task) => {
  const areaIds =
    task.area_ids && task.area_ids.length > 0
      ? task.area_ids
      : task.area_id !== null
        ? [task.area_id]
        : [];

  return areaIds
    .map((areaId) => areas.find((area) => area.id === areaId)?.name)
    .filter(Boolean)
    .join(", ");
};
  const getProfileName = (profileId: string | null) => {
    if (!profileId) return "Nieznany pracownik";

    const user = profiles.find((p) => p.id === profileId);

    if (!user) return "Nieznany pracownik";

    return `${user.name}${user.surname ? " " + user.surname : ""}`;
  };

  const getTaskImages = (taskId: number) => {
    return taskImages.filter((img) => img.task_id === taskId);
  };

  const loadSignedImageUrls = async (images: TaskImage[]) => {
    const urls: Record<number, string> = {};

    for (const img of images) {
      if (!img.file_path) {
        urls[img.id] = img.image_url;
        continue;
      }

      const { data, error } = await supabase.storage
        .from("task-images")
        .createSignedUrl(img.file_path, 3600);

      if (!error && data?.signedUrl) {
        urls[img.id] = data.signedUrl;
      } else {
        urls[img.id] = img.image_url;
      }
    }

    setSignedImageUrls(urls);
  };

  const refreshTaskImages = async () => {
    const { data: images } = await supabase.from("task_images").select("*");
    setTaskImages(images || []);
    await loadSignedImageUrls(images || []);
  };

const refreshTaskComments = async () => {
  const { data, error } = await supabase
    .from("task_comments")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Błąd pobierania wiadomości:", error);
    return;
  }

  setTaskComments(data || []);
};

const sendTaskComment = async (taskId: number) => {
  if (!profile) return;

  const message = commentDraft.trim();

  if (!message) return;

  const task = tasks.find((t) => t.id === taskId);

  if (!task) return;

  const { data, error } = await supabase
    .from("task_comments")
    .insert({
      task_id: taskId,
      author_id: profile.id,
      message,
    })
    .select()
    .single();

  if (error) {
  await logAppError(
    "task_comment_error",
    error.message,
    {
      taskId,
      code: error.code,
      details: error.details,
      hint: error.hint,
    },
  );

  alert("Nie udało się wysłać wiadomości: " + error.message);
  return;
}

  setTaskComments((prev) => {
    if (prev.some((comment) => comment.id === data.id)) {
      return prev;
    }

    return [...prev, data];
  });

  setCommentDraft("");

  let notificationUserIds: string[] = [];

  // Jeśli wiadomość napisał odbiorca taska,
  // powiadamiamy autora zadania.
  if (profile.id !== task.authorId) {
    notificationUserIds = [task.authorId];
  } else {
    // Jeśli odpowiada autor taska,
    // powiadamiamy osoby, które wcześniej pisały w tym wątku.
    notificationUserIds = [
      ...new Set(
        taskComments
          .filter(
            (comment) =>
              comment.task_id === taskId &&
              comment.author_id !== profile.id,
          )
          .map((comment) => comment.author_id),
      ),
    ];
  }

  await Promise.allSettled(
  notificationUserIds.map(async (userId) => {
    try {
      const response = await fetch(
        "https://ueqbjgjmalktqwkbwzkm.functions.supabase.co/send-push",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            userId,
            title: "💬 Nowa wiadomość w zadaniu",
            body: message,
          }),
        },
      );

      if (!response.ok) {
        const responseText = await response.text();

        await logAppError(
          "task_comment_push_error",
          `Push zwrócił HTTP ${response.status}`,
          {
            taskId,
            recipientUserId: userId,
            status: response.status,
            response: responseText,
          },
        );
      }
    } catch (pushError) {
      await logAppError(
        "task_comment_push_error",
        pushError instanceof Error
          ? pushError.message
          : "Nieznany błąd wysyłania push",
        {
          taskId,
          recipientUserId: userId,
        },
      );
    }
  }),
);
};

  const toggleSection = (key: SectionKey) => {
    setOpenSections((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const playSound = () => {
    const audio = new Audio("/notify.mp3");
    audio.volume = 0.6;
    audio.play().catch(() => {});
  };

  const vibrate = () => {
    if (navigator.vibrate) {
      navigator.vibrate([200, 100, 200]);
    }
  };

  const logAppError = async (
  errorType: string,
  message: string,
  details: Record<string, unknown> | null = null,
) => {
  try {
    const { error } = await supabase.from("app_errors").insert({
      user_id: profile?.id ?? null,
      hotel_id: profile?.hotel_id ?? null,
      department_id: profile?.department_id ?? null,
      error_type: errorType,
      message,
      details,
      page_path:
        typeof window !== "undefined" ? window.location.pathname : null,
    });

    if (error) {
      console.error("Nie udało się zapisać błędu aplikacji:", error);
    }
  } catch (loggingError) {
    console.error("Błąd mechanizmu logowania:", loggingError);
  }
};

  useEffect(() => {
    const load = async () => {
      const { data: auth } = await supabase.auth.getUser();

      if (!auth.user) {
        setLoading(false);
        return;
      }

      const { data: prof } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", auth.user.id)
        .single();

      setProfile(prof || null);

      const { data } = await supabase.from("tasks").select("*");
      setTasks(data || []);

      await refreshTaskImages();
      await refreshTaskComments();

      const { data: allProfiles } = await supabase.from("profiles").select("*");
      setProfiles(allProfiles || []);

      const { data: allAreas } = await supabase.from("areas").select("*");
      setAreas(allAreas || []);
      setLoading(false);
    };

    load();
  }, []);

  useEffect(() => {
  if (!profile) return;

  const saveDailyActivity = async () => {
    const todayWarsaw = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Warsaw",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());

    const { error } = await supabase
      .from("user_activity_daily")
      .upsert(
        {
          user_id: profile.id,
          activity_date: todayWarsaw,
          hotel_id: profile.hotel_id,
          department_id: profile.department_id,
          last_seen_at: new Date().toISOString(),
        },
        {
          onConflict: "user_id,activity_date",
        },
      );

    if (error) {
  console.error("Błąd zapisu aktywności:", {
    message: error.message,
    code: error.code,
    details: error.details,
    hint: error.hint,
  });
} else {
  console.log("Aktywność użytkownika zapisana.");
}  
};

  saveDailyActivity();
}, [profile]);

  useEffect(() => {
  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((_event, session) => {
    if (!session?.user) {
      setProfile(null);
      setTasks([]);
      setProfiles([]);
      setTaskImages([]);
    }
  });

  return () => {
    subscription.unsubscribe();
  };
}, []);

  useEffect(() => {
    if (!profile) return;

    const channel = supabase
      .channel("tasks-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tasks" },
        (payload) => {
          const newRow = payload.new as Task;
          const oldRow = payload.old as Task;

          setTasks((prev) => {
            if (payload.eventType === "INSERT") {
              if (newRow.assigneeId === profile.id) {
                playSound();
                vibrate();
              }

              setTimeout(() => {
                refreshTaskImages();
              }, 1500);

              return [...prev, newRow];
            }

            if (payload.eventType === "UPDATE") {
              return prev.map((t) => (t.id === newRow.id ? newRow : t));
            }

            if (payload.eventType === "DELETE") {
              return prev.filter((t) => t.id !== oldRow.id);
            }

            return prev;
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile]);

useEffect(() => {
  if (!profile) return;

  const commentsChannel = supabase
    .channel("task-comments-live")
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "task_comments",
      },
      (payload) => {
        const newComment = payload.new as TaskComment;

        setTaskComments((prev) => {
          if (prev.some((comment) => comment.id === newComment.id)) {
            return prev;
          }

          return [...prev, newComment];
        });
      },
    )
    .subscribe();

  return () => {
    supabase.removeChannel(commentsChannel);
  };
}, [profile]);

  const signIn = async () => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      alert("Błąd logowania: " + error.message);
      return;
    }

    window.location.reload();
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
  };

  const isHotelManager = profile?.role === "kierownik_hotelu";
  const isManager = profile?.role === "kierownik";
  const isAdmin = profile?.role === "administrator"|| profile?.role === "admin";

 const addTask = async () => {
  if (isSending) return;
  if (!newTask.trim() || !profile) return;

  const taskText = newTask.trim();
  const attachmentsToUpload = [...selectedAttachments];

  setIsSending(true);

  try {
    const targetHotelId =
      isManager || isAdmin ? selectedHotel : profile.hotel_id;

    const isHousekeepingManagerTarget =
      selectedTargetType === "housekeeping_manager";

    const isHotelManagerTarget =
      selectedTargetType === "department" &&
      selectedDepartment === 1 &&
      selectedRecipientType === "hotel_manager";

    const isHousekeepingTeamTarget =
      selectedTargetType === "department" &&
      selectedDepartment === 1 &&
      selectedRecipientType === "team";

    const targetDepartment = isHousekeepingManagerTarget
      ? 1
      : selectedDepartment;

    if (isHousekeepingTeamTarget && selectedAreas.length === 0) {
    alert("Wybierz co najmniej jeden obszar dla zadania pokojowych.");
    return;
    }

    const { data: candidates, error: candidatesError } = await supabase
      .from("profiles")
      .select("*")
      .eq("department_id", targetDepartment);

    if (candidatesError) {
      alert("Błąd pobierania pracowników: " + candidatesError.message);
      return;
    }

    const generalAreaId = getGeneralAreaId(targetHotelId);
    const targets = (candidates || []).filter((p: Profile) => {
  if (isHousekeepingManagerTarget) {
  return p.role === "kierownik";
}

  if (isHotelManagerTarget) {
  return (
    p.role === "kierownik_hotelu" &&
    p.hotel_id === targetHotelId
  );
}

 const basicMatch =
  (
    p.role === "pracownik" ||
    (isHousekeepingTeamTarget && p.role === "kierownik_hotelu")
  ) &&
  p.hotel_id === targetHotelId &&
  p.status === "na stanowisku";

  if (!basicMatch) return false;

  // Dla innych działów wystarczy hotel + status
  if (!isHousekeepingTeamTarget) {
    return true;
  }

  // Zadanie "Ogólne" dostają wszystkie pokojowe
  // będące aktualnie na stanowisku w tym hotelu.
  if (
  generalAreaId !== null &&
  selectedAreas.includes(generalAreaId)
) {
  return true;
}

  // Zadanie na konkretne piętro dostają tylko osoby,
  // które mają obecnie zaznaczone to piętro.
 return selectedAreas.some(
  (areaId) => p.current_area_ids?.includes(areaId) ?? false,
    );
});

if (
  (isHousekeepingManagerTarget || isHotelManagerTarget) &&
  targets.length === 0
) {
  alert(
    isHotelManagerTarget
      ? "Nie znaleziono konta kierowniczki pokojowych dla tego hotelu."
      : "Nie znaleziono konta Managera pokojowych.",
  );
  return;
}

    if (isHotelManagerTarget && targets.length > 1) {
  alert(
    "Znaleziono więcej niż jedną kierowniczkę pokojowych dla tego hotelu. Sprawdź role kont w Supabase.",
  );
  return;
}

    const directAssignee =
      isHousekeepingManagerTarget || isHotelManagerTarget
        ? targets[0]
        : null;

    const rows = [
      {
        title: taskText,
        authorId: profile.id,
        assigneeId: directAssignee?.id || null,
        departmentId: targetDepartment,
        hotel_id: targetHotelId,
        area_id: isHousekeepingTeamTarget
          ? selectedAreas[0] ?? null
          : null,

        area_ids: isHousekeepingTeamTarget
          ? selectedAreas
          : [],
        done: false,
        completedBy: null,
        archivedBy: [],
        createdAt: new Date().toISOString(),
        completedAt: null,
      },
    ];

    const { data, error } = await supabase
      .from("tasks")
      .insert(rows)
      .select();

    if (error) {
  await logAppError(
    "task_create_error",
    error.message,
    {
      code: error.code,
      details: error.details,
      hint: error.hint,
      selectedHotel,
      selectedDepartment,
      selectedTargetType,
    },
  );

  alert("Błąd zapisu taska: " + error.message);
  return;
}

    const createdTask = data?.[0];

// Task jest już zapisany w bazie.
// Od razu zwalniamy interfejs użytkownika.
setNewTask("");
setSelectedAttachments([]);
setSelectedTargetType("department");
setSelectedRecipientType("team");
setSelectedArea(null);
setSelectedAreas([]);
setShowForm(false);
setIsSending(false);

// Zdjęcia/filmy wysyłamy dalej bez blokowania formularza.
const uploadPromise = (async () => {
  if (!createdTask || attachmentsToUpload.length === 0) return;

  for (const file of attachmentsToUpload) {
    const fileExt = file.name.split(".").pop();
    const fileName =
      `${createdTask.id}-${Date.now()}-${Math.random()}.${fileExt}`;

    const filePath =
      `tasks/${createdTask.id}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from("task-images")
      .upload(filePath, file, {
        contentType: file.type,
      });

    if (uploadError) {
      console.error("uploadError:", uploadError);
      continue;
    }

    const { data: publicUrlData } = supabase.storage
      .from("task-images")
      .getPublicUrl(filePath);

    await supabase.from("task_images").insert({
      task_id: createdTask.id,
      image_url: publicUrlData.publicUrl,
      file_path: filePath,
      file_type: file.type,
    });
  }

  await refreshTaskImages();
})();

// Pushe lecą równolegle do wszystkich odbiorców.
const pushPromise = Promise.all(
  targets
    .filter((target) => target.status === "na stanowisku")
    .map(async (target) => {
    try {
      const response = await fetch(
        "https://ueqbjgjmalktqwkbwzkm.functions.supabase.co/send-push",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            userId: target.id,
            title: "Nowe zadanie",
            body: taskText,
          }),
        },
      );

      if (!response.ok) {
        const responseText = await response.text();

        await logAppError(
          "task_push_error",
          `Push zwrócił HTTP ${response.status}`,
          {
            taskId: createdTask.id,
            recipientUserId: target.id,
            status: response.status,
            response: responseText,
          },
        );
      }

      return response;
    } catch (pushError) {
      await logAppError(
        "task_push_error",
        pushError instanceof Error
          ? pushError.message
          : "Nieznany błąd wysyłania push",
        {
          taskId: createdTask.id,
          recipientUserId: target.id,
        },
      );

      throw pushError;
    }
  }),
);

// Upload i push wykonują się równolegle.
const results = await Promise.allSettled([
  uploadPromise,
  pushPromise,
]);

results.forEach((result) => {
  if (result.status === "rejected") {
    console.error("Błąd operacji w tle:", result.reason);
  }
});

    setNewTask("");
    setSelectedAttachments([]);
    setSelectedTargetType("department");
    setSelectedRecipientType("team");
    setSelectedArea(null);
    setShowForm(false);
  } catch (err) {
    console.error("addTask error:", err);
    alert("Nie udało się wysłać zadania.");
  } finally {
    setIsSending(false);
  }
};

  const markDone = async (id: number) => {
    if (!profile) return;

    await supabase
      .from("tasks")
      .update({
        done: true,
        completedBy: profile.id,
        completedAt: new Date().toISOString(),
      })
      .eq("id", id);
  };

  const archiveTask = async (id: number) => {
    const task = tasks.find((t) => t.id === id);
    if (!task || !profile) return;

    await supabase
      .from("tasks")
      .update({
        archivedBy: [...(task.archivedBy || []), profile.id],
      })
      .eq("id", id);
  };

  const cancelTask = async (id: number) => {
  if (!profile) return;

  const task = tasks.find((t) => t.id === id);

  if (!task) return;

  if (task.authorId !== profile.id) {
    alert("Możesz wycofać tylko zadanie wysłane przez siebie.");
    return;
  }

  if (task.done) {
    alert("Nie można wycofać zadania, które zostało już wykonane.");
    return;
  }

  const confirmed = window.confirm(
    "Czy na pewno chcesz wycofać to zadanie? Odbiorcy przestaną je widzieć.",
  );

  if (!confirmed) return;

  const cancelledAt = new Date().toISOString();

  const { error } = await supabase
    .from("tasks")
    .update({
      cancelled_at: cancelledAt,
      cancelled_by: profile.id,
    })
    .eq("id", id)
    .eq("authorId", profile.id)
    .eq("done", false);

  if (error) {
    alert("Nie udało się wycofać zadania: " + error.message);
    return;
  }

  setTasks((prev) =>
    prev.map((t) =>
      t.id === id
        ? {
            ...t,
            cancelled_at: cancelledAt,
            cancelled_by: profile.id,
          }
        : t,
    ),
  );
};

  const archivePreviousMonths = async () => {
  if (!profile || !isAdmin) return;

  const confirmed = window.confirm(
    "Przenieść wszystkie wykonane zadania ze starszych miesięcy do archiwum historycznego?",
  );

  if (!confirmed) return;

  const now = new Date();

  const startOfCurrentMonth = new Date(
    now.getFullYear(),
    now.getMonth(),
    1,
    0,
    0,
    0,
    0,
  );

  const archivedAt = new Date().toISOString();

  const { data, error } = await supabase
    .from("tasks")
    .update({
      history_archived_at: archivedAt,
      history_archived_by: profile.id,
    })
    .eq("done", true)
    .is("history_archived_at", null)
    .not("completedAt", "is", null)
    .lt("completedAt", startOfCurrentMonth.toISOString())
    .select("id");

  if (error) {
    alert("Błąd archiwizacji historycznej: " + error.message);
    return;
  }

  const archivedIds = new Set((data || []).map((task) => task.id));

  setTasks((prev) =>
    prev.map((task) =>
      archivedIds.has(task.id)
        ? {
            ...task,
            history_archived_at: archivedAt,
            history_archived_by: profile.id,
          }
        : task,
    ),
  );

  alert(
    `Przeniesiono ${data?.length || 0} zadań do archiwum historycznego.`,
  );
};

  const toggleStatus = async () => {
    if (!profile) return;

    const newStatus: Status =
      profile.status === "na stanowisku"
        ? "poza stanowiskiem"
        : "na stanowisku";

    await supabase
      .from("profiles")
      .update({
        status: newStatus,
      })
      .eq("id", profile.id);

    setProfile({
      ...profile,
      status: newStatus,
    });
  };
  const enablePush = async () => {
    try {
      if (!("serviceWorker" in navigator)) {
        alert("Ta przeglądarka nie obsługuje Service Workera");
        return;
      }

      if (!("PushManager" in window)) {
        alert("Ta przeglądarka nie obsługuje powiadomień push");
        return;
      }

      const permission = await Notification.requestPermission();

      if (permission !== "granted") {
        alert("Brak zgody na powiadomienia");
        return;
      }

      const registration = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;

      const oldSubscription = await registration.pushManager.getSubscription();

      if (oldSubscription) {
        await oldSubscription.unsubscribe();
      }

      const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

      console.log("FRONT vapid public length:", publicKey?.length);
      console.log("FRONT vapid public first chars:", publicKey?.slice(0, 12));

      if (!publicKey) {
        alert("Brak NEXT_PUBLIC_VAPID_PUBLIC_KEY");
        return;
      }

      let subscription;

      try {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });

        alert("Subskrypcja utworzona");
      } catch (err) {
        alert("Błąd subscribe: " + String(err));
        console.error(err);
        return;
      }

      console.log("subscription:", subscription);

                const {
            data: { session },
          } = await supabase.auth.getSession();

          if (!session?.user) {
            setProfile(null);
            alert("Sesja wygasła. Zaloguj się ponownie.");
            return;
          }

      const { error } = await supabase.from("push_subscriptions").insert({
        user_id: session.user.id,
        subscription: JSON.parse(JSON.stringify(subscription)),
      });

      if (error) {
        console.error("push subscription insert error:", error);
        alert("Nie udało się zapisać subskrypcji: " + error.message);
        return;
      }

      alert("Powiadomienia aktywne 🔔");
    } catch (err) {
      console.error("enablePush error:", err);
      alert("Błąd Push ON: " + String(err));
    }
  };

  const received = tasks.filter((t) => {
    if (!profile) return false;
    if (t.history_archived_at) return false;
    if (t.cancelled_at) return false;

    const notArchived = !t.archivedBy?.includes(profile.id);
    const notAuthor = t.authorId !== profile.id;

    if (isAdmin) {
      return (
        notAuthor &&
        notArchived &&
        profile.status === "na stanowisku" &&
        !t.done &&
        (filterHotel === 0 || t.hotel_id === filterHotel)
      );
    }

    if (isManager) {
  return (
    t.departmentId === profile.department_id &&
    (filterHotel === 0 || t.hotel_id === filterHotel) &&
    profile.status === "na stanowisku" &&
    notAuthor &&
    notArchived &&
    !t.done
  );
}

    if (isHotelManager) {
  const isDirectTask = t.assigneeId === profile.id;
  const isTeamTask = t.assigneeId === null;

  const generalAreaId = getGeneralAreaId(profile.hotel_id);

  const taskAreaIds =
    t.area_ids && t.area_ids.length > 0
      ? t.area_ids
      : t.area_id !== null
        ? [t.area_id]
        : [];

  const areaMatches =
    (generalAreaId !== null && taskAreaIds.includes(generalAreaId)) ||
    taskAreaIds.some(
      (areaId) => profile.current_area_ids?.includes(areaId) ?? false,
    );

  return (
    t.hotel_id === profile.hotel_id &&
    t.departmentId === profile.department_id &&
    (isDirectTask || (isTeamTask && areaMatches)) &&
    profile.status === "na stanowisku" &&
    notAuthor &&
    notArchived &&
    !t.done
  );
}

   const generalAreaId = getGeneralAreaId(profile.hotel_id);

const taskAreaIds =
  t.area_ids && t.area_ids.length > 0
    ? t.area_ids
    : t.area_id !== null
      ? [t.area_id]
      : [];

const areaMatches =
  profile.department_id !== 1 ||
  (generalAreaId !== null && taskAreaIds.includes(generalAreaId)) ||
  taskAreaIds.some(
    (areaId) => profile.current_area_ids?.includes(areaId) ?? false,
  );

    const addressedToMe = t.assigneeId === null || t.assigneeId === profile.id;

    return (
      t.hotel_id === profile.hotel_id &&
      t.departmentId === profile.department_id &&
      addressedToMe &&
      areaMatches &&
      notAuthor &&
      profile.status === "na stanowisku" &&
      notArchived 
    );
  });

  const sent = tasks.filter((t) => {
    if (!profile) return false;
    if (t.history_archived_at) return false;
    if (t.cancelled_at) return false;

    const notArchived = !t.archivedBy?.includes(profile.id);

    const authorProfile = profiles.find((p) => p.id === t.authorId);

    if (isAdmin) {
      return notArchived;
    }

    if (isManager) {
      return (
        authorProfile?.department_id === profile.department_id &&
        (filterHotel === 0 || t.hotel_id === filterHotel) &&
        notArchived
      );
    }

    if (isHotelManager) {
  return (
    authorProfile?.hotel_id === profile.hotel_id &&
    authorProfile?.department_id === profile.department_id &&
    notArchived &&
    !t.done
  );
}

    return t.authorId === profile.id && notArchived;
  });

  const archivedReceived = tasks.filter((t) => {
    if (!profile) return false;
    if (t.history_archived_at) return false;

    if (isAdmin) {
      return t.done;
    }

    if (isManager) {
      return (
        t.departmentId === profile.department_id &&
        (filterHotel === 0 || t.hotel_id === filterHotel) &&
        t.done
      );
    }

    if (isHotelManager) {
  const wasDirectlyAssignedToMe = t.assigneeId === profile.id;
  const wasCompletedByMe = t.completedBy === profile.id;

  return (
    t.hotel_id === profile.hotel_id &&
    t.departmentId === profile.department_id &&
    t.done &&
    (wasDirectlyAssignedToMe || wasCompletedByMe)
  );
}
    const addressedToMe = t.assigneeId === null || t.assigneeId === profile.id;

    return (
      t.hotel_id === profile.hotel_id &&
      t.departmentId === profile.department_id &&
      addressedToMe &&
      t.archivedBy?.includes(profile.id)
    );
  });

  const archivedSent = tasks.filter((t) => {
    if (!profile) return false;
    if (t.history_archived_at) return false;

    const authorProfile = profiles.find((p) => p.id === t.authorId);

    if (isAdmin) {
      return t.done;
    }

    if (isManager) {
      return (
        authorProfile?.department_id === profile.department_id &&
        (filterHotel === 0 || t.hotel_id === filterHotel) &&
        t.done
      );
    }

    if (isHotelManager) {
  return (
    authorProfile?.hotel_id === profile.hotel_id &&
    authorProfile?.department_id === profile.department_id &&
    t.done
  );
}

    return t.authorId === profile.id && t.archivedBy?.includes(profile.id);
  });

  const historyTasks = isAdmin
  ? tasks.filter((t) => t.history_archived_at !== null)
  : [];

  const Badge = ({ count }: { count: number }) => {
    if (!count) return null;

    return (
      <span className="ml-2 inline-flex min-w-6 h-6 items-center justify-center rounded-full bg-red-500 px-2 text-xs font-bold text-white shadow-sm">
        {count}
      </span>
    );
  };

  const renderTasks = (list: Task[], mode: string) => {
    if (list.length === 0) {
      return (
        <div className="mb-3 rounded-2xl border border-dashed border-stone-300 bg-white/60 p-4 text-center text-sm text-stone-500">
          Brak zadań w tej sekcji
        </div>
      );
    }

    return list.map((t) => {
      const attachments = getTaskImages(t.id);

      const comments = taskComments.filter(
  (comment) => comment.task_id === t.id,
);

      const imagesOnly = attachments.filter(
        (item) => !item.file_type || item.file_type.startsWith("image/"),
      );

      const videosOnly = attachments.filter((item) =>
        item.file_type?.startsWith("video/"),
      );

      const allImageUrls = imagesOnly.map(
        (item) => signedImageUrls[item.id] || item.image_url,
      );

      return (
        <div
          key={t.id}
          className="mb-3 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="break-words text-sm font-semibold text-stone-900">
                {t.title}
              </p>

              <p className="mt-1 text-xs font-medium text-blue-700">
                🏨 {getHotelName(t.hotel_id)}
              </p>
              {t.departmentId === 1 && getTaskAreaNames(t) && (
                <p className="mt-1 text-xs font-medium text-stone-600">
                  📍 {getTaskAreaNames(t)}
                </p>
              )}

              <div className="mt-2 flex flex-wrap items-center gap-2">
                {t.done ? (
                  <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                    ✔ Wykonane
                  </span>
                ) : (
                  <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
                    W trakcie
                  </span>
                )}

                {mode === "archived" && (
                  <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-semibold text-stone-600">
                    📦 Archiwum
                  </span>
                )}
              </div>

              <MediaGallery
                attachments={attachments}
                signedImageUrls={signedImageUrls}
                setPreviewImages={setPreviewImages}
                setPreviewIndex={setPreviewIndex}
                setPreviewImage={setPreviewImage}
              />

              <button
  type="button"
  onClick={() =>
    setOpenCommentsTaskId((prev) =>
      prev === t.id ? null : t.id,
    )
  }
  className="mt-3 flex w-full items-center justify-between rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm font-semibold text-stone-700"
>
  <span>💬 Wiadomości</span>

  <span className="rounded-full bg-stone-200 px-2 py-0.5 text-xs">
    {comments.length}
  </span>
</button>

{openCommentsTaskId === t.id && (
  <div className="mt-2 rounded-2xl border border-stone-200 bg-stone-50 p-3">
    <div className="max-h-64 space-y-2 overflow-y-auto">
      {comments.length === 0 ? (
        <p className="py-3 text-center text-xs text-stone-500">
          Brak wiadomości. Możesz rozpocząć rozmowę.
        </p>
      ) : (
        comments.map((comment) => {
          const isOwnComment = comment.author_id === profile?.id;

          return (
            <div
              key={comment.id}
              className={`flex ${
                isOwnComment ? "justify-end" : "justify-start"
              }`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-3 py-2 ${
                  isOwnComment
                    ? "bg-stone-900 text-white"
                    : "border border-stone-200 bg-white text-stone-900"
                }`}
              >
                <p
                  className={`mb-1 text-[11px] font-bold ${
                    isOwnComment ? "text-stone-300" : "text-stone-500"
                  }`}
                >
                  {getProfileName(comment.author_id)}
                </p>

                <p className="whitespace-pre-wrap text-sm">
                  {comment.message}
                </p>

                <p
                  className={`mt-1 text-[10px] ${
                    isOwnComment ? "text-stone-400" : "text-stone-400"
                  }`}
                >
                  {new Date(comment.created_at).toLocaleString("pl-PL", {
                    day: "2-digit",
                    month: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
            </div>
          );
        })
      )}
    </div>

    {mode !== "history" && (
      <div className="mt-3 flex gap-2">
        <textarea
          value={commentDraft}
          onChange={(e) => setCommentDraft(e.target.value)}
          placeholder="Napisz wiadomość..."
          rows={2}
          className="min-h-[44px] flex-1 resize-none rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 outline-none"
        />

        <button
          type="button"
          onClick={() => sendTaskComment(t.id)}
          disabled={!commentDraft.trim()}
          className="self-end rounded-xl bg-stone-900 px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          Wyślij
        </button>
      </div>
    )}
  </div>
)}

              {t.done && (
                <div className="mt-2 text-xs text-stone-500">
                  👤 Wykonał: {getProfileName(t.completedBy)}
                  {t.completedAt && (
                    <span>
                      {" "}
                      •{" "}
                      {new Date(t.completedAt).toLocaleString("pl-PL", {
                        timeZone: "Europe/Warsaw",
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  )}
                </div>
              )}
            </div>

            {mode === "received" && (
              <div className="shrink-0">
                {!t.done ? (
                  <button
                    onClick={() => markDone(t.id)}
                    className="rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs font-semibold text-stone-900 shadow-sm"
                  >
                    Zrobione
                  </button>
                ) : (
                  <button
                    onClick={() => archiveTask(t.id)}
                    className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 shadow-sm"
                  >
                    Archiwizuj
                  </button>
                )}
              </div>
            )}

            {mode === "sent" &&
  !t.done &&
  t.authorId === profile?.id && (
    <div className="shrink-0">
      <button
        onClick={() => cancelTask(t.id)}
        className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 shadow-sm"
      >
        Wycofaj zadanie
      </button>
    </div>
  )}

            {mode === "sent" && t.done && (
              <div className="shrink-0">
                <button
                  onClick={() => archiveTask(t.id)}
                  className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 shadow-sm"
                >
                  Archiwizuj
                </button>
              </div>
            )}
          </div>
        </div>
      );
    });
  };

  const renderHistoryArchive = () => {
  if (!isAdmin) return null;

  if (historyTasks.length === 0) {
    return (
      <div className="mb-4 rounded-3xl border border-stone-200 bg-white p-4 shadow-sm">
        <p className="text-sm text-stone-500">
          Brak zadań w archiwum historycznym.
        </p>
      </div>
    );
  }

  const monthGroups = historyTasks.reduce<Record<string, Task[]>>(
    (groups, task) => {
      if (!task.completedAt) return groups;

      const date = new Date(task.completedAt);

      const monthKey = `${date.getFullYear()}-${String(
        date.getMonth() + 1,
      ).padStart(2, "0")}`;

      if (!groups[monthKey]) {
        groups[monthKey] = [];
      }

      groups[monthKey].push(task);

      return groups;
    },
    {},
  );

  const sortedMonths = Object.entries(monthGroups).sort(([a], [b]) =>
    b.localeCompare(a),
  );

 return (
  <details className="mb-4 rounded-3xl border border-stone-200 bg-white p-4 shadow-sm">
    <summary className="cursor-pointer font-bold text-stone-900">
      📚 Archiwum historyczne ({historyTasks.length})
    </summary>

    <div className="mt-4 space-y-2">
        {sortedMonths.map(([monthKey, monthTasks]) => {
          const [year, month] = monthKey.split("-").map(Number);

          const monthName = new Date(
            year,
            month - 1,
            1,
          ).toLocaleDateString("pl-PL", {
            month: "long",
            year: "numeric",
          });

          return (
            <details
              key={monthKey}
              className="rounded-2xl border border-stone-200 bg-stone-50 p-3"
            >
              <summary className="cursor-pointer font-bold text-stone-900">
                📅 {monthName} ({monthTasks.length})
              </summary>

              <div className="mt-3 space-y-2">
                {departments.map((department) => {
                  const departmentTasks = monthTasks.filter(
                    (task) => task.departmentId === department.id,
                  );

                  if (departmentTasks.length === 0) return null;

                  return (
                    <details
                      key={department.id}
                      className="rounded-xl border border-stone-200 bg-white p-3"
                    >
                      <summary className="cursor-pointer text-sm font-bold text-stone-800">
                        {department.name} ({departmentTasks.length})
                      </summary>

                      <div className="mt-3">
                        {renderTasks(departmentTasks, "history")}
                      </div>
                    </details>
                  );
                })}
              </div>
            </details>
          );
        })}
      </div>
    </details>
  );
};

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-white via-blue-50 to-blue-200 flex items-center justify-center p-6">
        Ładowanie...
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-100 via-blue-300 to-white flex items-center justify-center p-6">
        <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-xl border border-stone-200">
          <div className="mb-6 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-stone-900 text-xl text-white">
              ✓
            </div>
            <h1 className="text-2xl font-bold text-stone-900">Task Hotel</h1>
            <p className="mt-1 text-sm text-stone-500">
              Zaloguj się do panelu zadań
            </p>
          </div>

          <div className="space-y-3">
            <input
              className="w-full rounded-2xl border border-stone-300 bg-stone-50 p-3 text-sm text-stone-900 outline-none"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />

            <input
              className="w-full rounded-2xl border border-stone-300 bg-stone-50 p-3 text-sm text-stone-900 outline-none"
              placeholder="Hasło"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />

            <button
              onClick={signIn}
              className="w-full rounded-2xl bg-stone-900 py-3 text-sm font-bold text-white shadow-md"
            >
              Zaloguj
            </button>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-100 via-blue-300 to-white flex items-center justify-center p-6">
      <div className="mx-auto w-full max-w-xl">
        {showAreaPicker && profile.department_id === 1 && (
          <AreaPickerModal
            profile={profile}
            areas={areas}
            setProfile={setProfile}
            setShowAreaPicker={setShowAreaPicker}
          />
        )}
        {previewImage && (
          <ImagePreviewModal
            previewImage={previewImage}
            previewImages={previewImages}
            previewIndex={previewIndex}
            setPreviewImage={setPreviewImage}
            setPreviewImages={setPreviewImages}
            setPreviewIndex={setPreviewIndex}
            touchStartX={touchStartX}
          />
        )}

        <AppHeader
          profile={profile}
          toggleStatus={toggleStatus}
          enablePush={enablePush}
          signOut={signOut}
          setShowAreaPicker={setShowAreaPicker}
          getAreaName={getAreaName}
        />

        {(isManager || isAdmin) && (
          <div className="mb-4 rounded-3xl border border-stone-200 bg-white p-4 shadow-sm">
            <label className="mb-2 block text-xs font-bold uppercase tracking-[0.2em] text-stone-500">
              Filtr hotelu
            </label>

            <select
              className="w-full rounded-2xl border border-stone-300 bg-stone-50 p-3 text-sm text-stone-900 outline-none"
              value={filterHotel}
              onChange={(e) => setFilterHotel(Number(e.target.value))}
            >
              <option value={0}>Wszystkie hotele</option>
              {hotels.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {isAdmin && (
  <div className="mb-4 rounded-3xl border border-stone-200 bg-white p-4 shadow-sm">
    <p className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-stone-500">
      Archiwizacja miesięczna
    </p>

    <button
      onClick={archivePreviousMonths}
      className="w-full rounded-2xl bg-stone-700 py-3 text-sm font-bold text-white shadow-md"
    >
      📚 Przenieś poprzednie miesiące do archiwum historycznego
    </button>
  </div>
)}

        <div className="mb-4 rounded-3xl border border-stone-200 bg-white p-4 shadow-sm">
          <button
            onClick={() => setShowForm(!showForm)}
            className="w-full rounded-2xl bg-stone-900 py-3 text-sm font-bold text-white shadow-md"
          >
            {showForm ? "Zamknij formularz" : "+ Nowe zadanie"}
          </button>

          {showForm && (
            <div className="mt-4 space-y-3">
              {/* 1. HOTEL */}
              {(isManager || isAdmin) && (
                <select
                  className="w-full rounded-2xl border border-stone-300 bg-stone-50 p-3 text-sm text-stone-900 outline-none"
                  value={selectedHotel}
                  onChange={(e) => {
                    setSelectedHotel(Number(e.target.value));
                    setSelectedArea(null);
                    setSelectedAreas([]);
                  }}
                >
                  {hotels.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.name}
                    </option>
                  ))}
                </select>
              )}

              {/* 2. TYP ODBIORCY */}
              <select
                className="w-full rounded-2xl border border-stone-300 bg-stone-50 p-3 text-sm text-stone-900 outline-none"
                value={selectedTargetType}
                onChange={(e) => {
  setSelectedTargetType(
    e.target.value as "department" | "housekeeping_manager",
  );
  setSelectedArea(null);
  setSelectedAreas([]);
  setSelectedRecipientType("team");
}}
              >
                <option value="department">Dział</option>
                <option value="housekeeping_manager">Manager pokojowych</option>
              </select>

              {selectedTargetType === "department" && (
                <>
                  {/* 3. DZIAŁ */}
                  <select
                    className="w-full rounded-2xl border border-stone-300 bg-stone-50 p-3 text-sm text-stone-900 outline-none"
                    value={selectedDepartment}
                   onChange={(e) => {
  setSelectedDepartment(Number(e.target.value));
  setSelectedArea(null);
  setSelectedAreas([]);
  setSelectedRecipientType("team");
}}
                  >
                    <option value={1}>POKOJOWE</option>
                    <option value={2}>KONSERWATORZY</option>
                    <option value={3}>RECEPCJA</option>
                  </select>

                  {selectedDepartment === 1 && (
                    <select
                      className="w-full rounded-2xl border border-stone-300 bg-stone-50 p-3 text-sm text-stone-900 outline-none"
                      value={selectedRecipientType}
                      onChange={(e) => {
  setSelectedRecipientType(
    e.target.value as "team" | "hotel_manager",
  );
  setSelectedArea(null);
  setSelectedAreas([]);
}}
                    >
                      <option value="team">Zespół pokojowych</option>
                      <option value="hotel_manager">
                      Kierowniczka pokojowych{" "}
                      {getHotelName(
                        isManager || isAdmin ? selectedHotel : profile.hotel_id
                      )}
                    </option>
                    </select>
                  )}

                  {/* 4. OBSZARY - tylko dla zespołu pokojowych */}
                  {selectedDepartment === 1 &&
                    selectedRecipientType === "team" && (
                      <div className="rounded-2xl border border-stone-300 bg-stone-50 p-3">
                        <p className="mb-2 text-xs font-bold uppercase tracking-[0.15em] text-stone-500">
                          Wybierz obszary
                        </p>

                        <div className="space-y-2">
                          {areas
                            .filter(
                              (area) =>
                                area.hotel_id ===
                                (isManager || isAdmin
                                  ? selectedHotel
                                  : profile.hotel_id),
                            )
                            .map((area) => (
                              <label
                                key={area.id}
                                className="flex items-center gap-3 rounded-xl bg-white px-3 py-2 text-sm text-stone-900"
                              >
                                <input
                                  type="checkbox"
                                  checked={selectedAreas.includes(area.id)}
                                  onChange={() => {
                                    setSelectedAreas((prev) =>
                                      prev.includes(area.id)
                                        ? prev.filter((id) => id !== area.id)
                                        : [...prev, area.id],
                                    );
                                  }}
                                />

                                <span>{area.name}</span>
                              </label>
                            ))}
                        </div>
                      </div>
                    )}
                </>
              )}

              {/* 4. TREŚĆ ZADANIA */}
              <input
                className="w-full rounded-2xl border border-stone-300 bg-stone-50 p-3 text-sm text-stone-900 outline-none"
                placeholder="Treść zadania"
                value={newTask}
                onChange={(e) => setNewTask(e.target.value)}
              />

              {/* 5. ZDJĘCIA I FILMY */}
              <label className="block text-xs font-bold uppercase tracking-[0.2em] text-stone-500">
                📎 Zdjęcia i filmy
              </label>

              <input
                type="file"
                accept="image/*,video/*"
                multiple
                className="w-full rounded-2xl border border-stone-300 bg-stone-50 p-3 text-sm text-stone-900 outline-none"
                onChange={(e) => {
                  const files = Array.from(e.target.files || []);

                  const images = files.filter((file) =>
                    file.type.startsWith("image/"),
                  );

                  const videos = files.filter((file) =>
                    file.type.startsWith("video/"),
                  );

                  if (images.length > 10) {
                    alert("Możesz dodać maksymalnie 10 zdjęć.");
                    e.target.value = "";
                    return;
                  }

                  if (videos.length > 1) {
                    alert("Możesz dodać maksymalnie 1 film.");
                    e.target.value = "";
                    return;
                  }

                  setSelectedAttachments(files);
                }}
              />

              {selectedAttachments.length > 0 && (
  <div className="rounded-xl bg-stone-50 p-3">
    <p className="mb-2 text-xs font-bold text-stone-500">
      Wybrane pliki ({selectedAttachments.length})
    </p>

    <div className="space-y-1">
      {selectedAttachments.map((file, index) => (
        <div
          key={index}
          className="flex items-center justify-between gap-2 rounded-lg bg-white px-3 py-2"
        >
          <div className="min-w-0 truncate text-xs text-stone-700">
            {file.type.startsWith("image/")
              ? "🖼️ "
              : file.type.startsWith("video/")
                ? "🎥 "
                : "📄 "}
            {file.name}
          </div>

          <button
            type="button"
            onClick={() =>
              setSelectedAttachments((prev) =>
                prev.filter((_, i) => i !== index)
              )
            }
            className="shrink-0 rounded-lg bg-red-100 px-2 py-1 text-xs font-bold text-red-700"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  </div>
)}

              {/* 6. WYŚLIJ */}
              <button
              onClick={addTask}
              disabled={isSending}
              className="w-full rounded-2xl bg-stone-900 py-3 text-sm font-bold text-white shadow-md disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSending ? "Wysyłanie..." : "Wyślij zadanie"}
            </button>
            </div>
          )}
        </div>

        <button
          onClick={() => toggleSection("otrzymane")}
          className="mb-2 flex w-full items-center justify-between rounded-2xl border border-stone-200 bg-white p-4 text-left font-bold text-stone-900 shadow-sm"
        >
          <span>📥 Otrzymane</span>
          <Badge count={received.length} />
        </button>

        {openSections.otrzymane && renderTasks(received, "received")}

        <button
          onClick={() => toggleSection("wysłane")}
          className="mb-2 mt-3 flex w-full items-center justify-between rounded-2xl border border-stone-200 bg-white p-4 text-left font-bold text-stone-900 shadow-sm"
        >
          <span>📤 Wysłane</span>
          <Badge count={sent.length} />
        </button>

        {openSections.wysłane && renderTasks(sent, "sent")}

        <button
          onClick={() => toggleSection("archiwum")}
          className="mb-2 mt-3 flex w-full items-center justify-between rounded-2xl border border-stone-200 bg-white p-4 text-left font-bold text-stone-900 shadow-sm"
        >
          <span>📦 Archiwum</span>
        </button>

        {openSections.archiwum && (
          <>
            <div className="mb-2 mt-3 text-xs font-bold uppercase tracking-[0.2em] text-stone-500">
              Otrzymane
            </div>

            {renderTasks(archivedReceived, "archived")}

            <div className="mb-2 mt-4 text-xs font-bold uppercase tracking-[0.2em] text-stone-500">
              Wysłane
            </div>

            {renderTasks(archivedSent, "archived")}
          </>
        )}
        {isAdmin && renderHistoryArchive()}
      </div>
    </div>
  );
}