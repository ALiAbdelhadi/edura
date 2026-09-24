"use client";

import { ConfirmDialog } from "@/components/kit/confirm-dialog";
import { EmptyState } from "@/components/kit/empty-state";
import { api } from "@/lib/api/client";
import { PageSpinner, Spinner } from "@/components/kit/spinner";
import { useFormatters } from "@/lib/i18n/use-formatters";
import { AMENITY_KEYS, ROOM_AMENITIES, amenityLabel } from "@/lib/rooms/amenities";
import { zodResolver } from "@hookform/resolvers/zod";
import { useCreate, useCustom, useDelete, useList, useUpdate } from "@refinedev/core";
import { Badge } from "@repo/ui/components/badge";
import { track } from "@/lib/track";
import { ANALYTICS_EVENTS } from "@repo/observability";
import { Button } from "@repo/ui/components/button";
import { Card, CardContent } from "@repo/ui/components/card";
import { Checkbox } from "@repo/ui/components/checkbox";
import { CldImage } from "@repo/ui/components/cld-image";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@repo/ui/components/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@repo/ui/components/form";
import { Input } from "@repo/ui/components/input";
import { QuerySection } from "@repo/ui/components/query-section";
import { toast } from "@repo/ui/components/sonner";
import { Textarea } from "@repo/ui/components/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@repo/ui/components/tooltip";
import { compressImage } from "@repo/ui/lib/image-compress";
import { Check, ChevronLeft, ChevronRight, Eye, Home, ImageIcon, ImagePlus, Pencil, Plus, Trash2, Users, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Amount, MetricCard, PageHead } from "./ledger";
import { QUERY_FRESHNESS } from "@/lib/refine";

type Room = {
  id?: string;
  name: string;
  capacity?: number | null;
  facilities?: string[];
  photos?: string[];
  price?: number | null;
  description?: string | null;
  allowedPricingMethods?: PricingMethod[];
  createdAt?: string;
};

type PricingMethod = "whole_room_percent" | "per_attending_student";

type M2Rate = { fee: number | null; bp: number | null };

type M2Availability = { ceiling: M2Rate | null; rooms: Record<string, M2Rate> };

const rateToInput = (r: M2Rate | null | undefined): string =>
  r == null ? "" : String((r.bp != null ? r.bp : r.fee!) / 100);

function roomId(r: Room): string {
  return r.id || "";
}

export function AdminRoomsScreen() {
  const t = useTranslations();
  const { formatEGP, locale } = useFormatters();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [viewingRoom, setViewingRoom] = useState<Room | null>(null);
  const [facilities, setFacilities] = useState<string[]>([]);
  const [featureDraft, setFeatureDraft] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [methods, setMethods] = useState<PricingMethod[]>(["whole_room_percent"]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { query, result } = useList({ resource: "rooms", queryOptions: QUERY_FRESHNESS.list });
  const { mutate: createRoom, mutation: createMutation } = useCreate();
  const { mutate: updateRoom, mutation: updateMutation } = useUpdate();
  const { mutate: deleteRoom, mutation: deleteMutation } = useDelete();

  const rooms = (result?.data ?? []) as Room[];

  const availabilityReq = useCustom({
    url: "rooms/per-student-availability",
    method: "get",
  });
  const availability = availabilityReq.result?.data as M2Availability | undefined;
  const ceiling = availability?.ceiling ?? null;
  const ownRate = editingId ? (availability?.rooms?.[editingId] ?? null) : null;
  const ceilingIsPercent = ceiling?.bp != null;
  const perStudentAvailable = ceiling != null || ownRate != null;
  const perStudentChecked = methods.includes("per_attending_student");
  const perStudentDisabled =
    !perStudentAvailable && !perStudentChecked && !availabilityReq.query.isLoading;

  const [rateInput, setRateInput] = useState("");
  const ceilingValue = ceiling ? (ceiling.bp ?? ceiling.fee!) / 100 : null;
  const rateNumber = rateInput.trim() === "" ? NaN : Number(rateInput);
  const rateTooHigh =
    ceilingValue != null && Number.isFinite(rateNumber) && rateNumber > ceilingValue;
  const rateMissing = perStudentChecked && ceiling != null && !Number.isFinite(rateNumber);

  const schema = useMemo(
    () =>
      z.object({
        name: z.string().min(1, t("adminManage.rooms.roomNameRequired")),
        capacity: z.number().min(1).optional(),
        price: z.number().min(0).optional(),
        description: z.string().max(2000).optional(),
      }),
    [t],
  );

  type FormValues = z.infer<typeof schema>;

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", capacity: undefined, price: undefined, description: "" },
  });

  const resetAll = () => {
    form.reset({ name: "", capacity: undefined, price: undefined, description: "" });
    setFacilities([]);
    setFeatureDraft("");
    setPhotos([]);
    setMethods(["whole_room_percent"]);
    setRateInput(rateToInput(ceiling));
  };

  const handleOpenChange = (open: boolean) => {
    setIsModalOpen(open);
    if (!open) resetAll();
  };

  const handleOpenCreate = () => {
    setEditingId(null);
    resetAll();
    setIsModalOpen(true);
  };

  const handleOpenEdit = (room: Room) => {
    setEditingId(roomId(room));
    form.reset({
      name: room.name,
      capacity: room.capacity ?? undefined,
      price: room.price != null ? Math.round(room.price) / 100 : undefined,
      description: room.description ?? "",
    });
    setFacilities(room.facilities ?? []);
    setPhotos(room.photos ?? []);
    setMethods(room.allowedPricingMethods ?? ["whole_room_percent"]);
    setFeatureDraft("");
    setRateInput(rateToInput(availability?.rooms?.[roomId(room)] ?? ceiling));
    setIsModalOpen(true);
  };

  const toggleAmenity = (key: string) =>
    setFacilities((cur) => (cur.includes(key) ? cur.filter((x) => x !== key) : [...cur, key]));

  const customExtras = facilities.filter((f) => !AMENITY_KEYS.has(f));

  const addCustom = () => {
    const v = featureDraft.trim();
    if (!v) return;
    if (!facilities.includes(v) && !AMENITY_KEYS.has(v)) setFacilities([...facilities, v]);
    setFeatureDraft("");
  };

  const removeFacility = (f: string) => setFacilities(facilities.filter((x) => x !== f));

  const movePhoto = (from: number, to: number) => {
    if (to < 0 || to >= photos.length) return;
    setPhotos((cur) => {
      const next = [...cur];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved!);
      return next;
    });
  };

  const photoErrorMessage = (payload: unknown): string => {
    const details = (
      payload as { error?: { details?: { reason?: string; max?: number; maxMb?: number } } } | null
    )?.error?.details;
    switch (details?.reason) {
      case "image_too_large":
        return t("adminManage.rooms.photoTooLarge", { max: details.maxMb ?? 5 });
      case "unsupported_image_type":
        return t("adminManage.rooms.photoUnsupportedType");
      case "too_many_photos":
        return t("adminManage.rooms.photoLimitReached", { max: details.max ?? 12 });
      case "uploads_not_configured":
        return t("adminManage.rooms.photoUploadsUnavailable");
      default:
        return t("adminManage.rooms.photoUploadFailed");
    }
  };

  const uploadPhoto = async (file: File) => {
    if (!editingId) return;
    setUploading(true);
    try {
      const compressed = await compressImage(file, { maxEdge: 2048 });
      const fd = new FormData();
      fd.append("file", compressed);
      const json = await api
        .post(`rooms/${editingId}/photos`, { body: fd, timeout: 60_000 })
        .json<{ data: { photos: string[] } }>();
      setPhotos(json.data.photos);
      toast.success(t("adminManage.rooms.photoUploaded"));
    } catch (err) {
      const body = (err as { data?: unknown })?.data;
      if (body && typeof body === "object") {
        toast.error(photoErrorMessage(body));
      } else {
        toast.error(
          (err as { message?: string })?.message || t("adminManage.rooms.photoUploadFailed"),
        );
      }
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const removePhoto = (url: string) => setPhotos(photos.filter((p) => p !== url));

  const ratePayload = (): M2Rate | null | undefined => {
    if (!perStudentChecked) return null;
    if (!ceiling) return undefined;
    const units = Math.round(rateNumber * 100);
    return ceilingIsPercent ? { fee: null, bp: units } : { fee: units, bp: null };
  };

  const handleSubmit = (values: FormValues) => {
    if (methods.length === 0) {
      toast.error(t("adminManage.rooms.methodsRequired"));
      return;
    }
    if (rateMissing) {
      toast.error(t("adminManage.rooms.perStudentRateRequired"));
      return;
    }
    if (perStudentChecked && rateTooHigh) {
      toast.error(
        ceilingIsPercent
          ? t("adminManage.rooms.perStudentRateMaxPercent", { max: ceilingValue! })
          : t("adminManage.rooms.perStudentRateMaxFlat", { max: ceilingValue! }),
      );
      return;
    }
    const payload = {
      name: values.name,
      capacity: values.capacity,
      price: values.price != null ? Math.round(values.price * 100) : null,
      description: values.description?.trim() || null,
      facilities,
      photos,
      allowedPricingMethods: methods,
      perStudentRate: ratePayload(),
    };
    if (editingId) {
      updateRoom(
        { resource: "rooms", id: editingId, values: payload },
        {
          onSuccess: () => {
            toast.success(t("adminManage.rooms.roomUpdated"));
            availabilityReq.query.refetch();
            handleOpenChange(false);
          },
          onError: (err) =>
            toast.error((err as { message?: string })?.message || t("adminManage.rooms.failedUpdate")),
        },
      );
    } else {
      createRoom(
        { resource: "rooms", values: payload },
        {
          onSuccess: () => {
            toast.success(t("adminManage.rooms.roomCreated"));
            availabilityReq.query.refetch();
            handleOpenChange(false);
          },
          onError: (err) =>
            toast.error((err as { message?: string })?.message || t("adminManage.rooms.failedCreate")),
        },
      );
    }
  };

  const handleDelete = (id: string) => {
    deleteRoom(
      { resource: "rooms", id },
      {
        onSuccess: () => toast.success(t("adminManage.rooms.roomDeleted")),
        onError: (err) =>
          toast.error((err as { message?: string })?.message || t("adminManage.rooms.failedDelete")),
      },
    );
  };

  const modalTitle = editingId ? t("adminManage.rooms.editRoom") : t("adminManage.rooms.addRoom");
  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="flex flex-col gap-5">
      <PageHead
        title={t("nav.rooms")}
        subtitle={t("adminManage.rooms.subtitle")}
        actions={
          <Button onClick={handleOpenCreate}>
            <Plus className="size-4" />
            {t("adminManage.rooms.addRoom")}
          </Button>
        }
      />

      <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
        <MetricCard
          href="/dashboard/admin/rooms"
          label={t("adminManage.rooms.totalRooms")}
          icon={<Home className="size-[15px]" />}
          tone="indigo"
          count={rooms.length}
          fact={t("adminManage.rooms.totalRoomsFact")}
        />
      </div>

      <QuerySection
        query={query}
        skeleton={<PageSpinner />}
        isEmpty={rooms.length === 0}
        empty={
          <Card>
            <CardContent className="py-10">
              <EmptyState
                icon={Home}
                title={t("activation.empty.rooms.title")}
                description={t("activation.empty.rooms.body")}
                action={
                  <Button
                    onClick={() => {
                      track(ANALYTICS_EVENTS.EMPTY_STATE_CTA_CLICKED, { list: "rooms" });
                      handleOpenCreate();
                    }}
                  >
                    {t("activation.empty.rooms.cta")}
                  </Button>
                }
              />
            </CardContent>
          </Card>
        }
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rooms.map((room) => {
            const id = roomId(room);
            const cover = room.photos?.[0];
            const feats = room.facilities ?? [];
            return (
              <Card key={id} className="flex flex-col overflow-hidden p-0">
                <div className="relative aspect-video w-full bg-muted">
                  {cover ? (
                    <CldImage
                      src={cover}
                      alt={room.name}
                      width={640}
                      height={360}
                      sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-muted-foreground/40">
                      <Home className="size-10" />
                    </div>
                  )}
                  {(room.photos?.length ?? 0) > 1 ? (
                    <span className="num absolute inset-e-2 top-2 flex items-center gap-1 rounded-[5px] bg-[var(--ink)]/70 px-1.5 py-px text-[11px] font-semibold text-[var(--sheet)]">
                      <ImageIcon className="size-3" />
                      {room.photos!.length}
                    </span>
                  ) : null}
                  {room.price != null ? (
                    <span className="absolute bottom-2 inset-s-2 rounded-[5px] bg-[var(--teal-soft)] px-2 py-0.5 text-[var(--teal)]">
                      <Amount
                        piasters={room.price}
                        locale={locale}
                        decimals={false}
                        className="text-[13px] font-semibold"
                        currencyClassName="ms-1 text-[10px] font-medium"
                      />
                    </span>
                  ) : null}
                </div>
                <CardContent className="flex flex-1 flex-col gap-3 p-4">
                  <div className="min-w-0">
                    <h3 className="truncate font-semibold text-foreground">{room.name}</h3>
                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Users className="size-3.5" />
                      {room.capacity != null
                        ? `${room.capacity} ${t("adminManage.rooms.seats")}`
                        : "—"}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {(room.allowedPricingMethods ?? ["whole_room_percent"]).map((m) => (
                      <Badge
                        key={m}
                        variant={m === "per_attending_student" ? "default" : "secondary"}
                        className="text-[10px]"
                      >
                        {m === "per_attending_student"
                          ? t("adminManage.rooms.methodPerStudent")
                          : t("adminManage.rooms.methodPercent")}
                      </Badge>
                    ))}
                  </div>
                  {feats.length ? (
                    <div className="flex flex-wrap gap-1">
                      {feats.slice(0, 3).map((x) => (
                        <Badge key={x} variant="secondary">
                          {amenityLabel(x, locale)}
                        </Badge>
                      ))}
                      {feats.length > 3 ? <Badge variant="outline">+{feats.length - 3}</Badge> : null}
                    </div>
                  ) : null}
                  <div className="mt-auto flex items-center gap-1 pt-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => setViewingRoom(room)}
                    >
                      <Eye className="size-4" />
                      {t("adminManage.rooms.viewDetails")}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-[var(--ink-2)]"
                      onClick={() => handleOpenEdit(room)}
                    >
                      <Pencil className="size-4" />
                      {t("actions.edit")}
                    </Button>
                    <ConfirmDialog
                      trigger={
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive"
                          disabled={deleteMutation.isPending}
                        >
                          <Trash2 className="size-4" />
                          {t("actions.delete")}
                        </Button>
                      }
                      title={t("adminManage.rooms.deleteRoomTitle")}
                      description={t("adminManage.rooms.deleteRoomDescription")}
                      confirmText={t("actions.delete")}
                      cancelText={t("actions.cancel")}
                      destructive
                      onConfirm={() => handleDelete(id)}
                    />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </QuerySection>
      <RoomDetailsDialog
        room={viewingRoom}
        onOpenChange={(open) => !open && setViewingRoom(null)}
        onEdit={(room) => {
          setViewingRoom(null);
          handleOpenEdit(room);
        }}
      />
      <Dialog open={isModalOpen} onOpenChange={handleOpenChange}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{modalTitle}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form noValidate onSubmit={form.handleSubmit(handleSubmit)} autoComplete="off" className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("adminManage.rooms.roomName")}</FormLabel>
                    <FormControl>
                      <Input placeholder={t("adminManage.rooms.roomNamePlaceholder")} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="capacity"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("adminManage.rooms.capacity")}</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={1}
                          placeholder={t("adminManage.rooms.capacityPlaceholder")}
                          name={field.name}
                          ref={field.ref}
                          onBlur={field.onBlur}
                          value={field.value ?? ""}
                          onChange={(e) => {
                            const v = e.target.valueAsNumber;
                            field.onChange(e.target.value === "" || Number.isNaN(v) ? undefined : v);
                          }}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="price"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("adminManage.rooms.price")}</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min={0}
                          step="0.01"
                          placeholder={t("adminManage.rooms.pricePlaceholder")}
                          name={field.name}
                          ref={field.ref}
                          onBlur={field.onBlur}
                          value={field.value ?? ""}
                          onChange={(e) => {
                            const v = e.target.valueAsNumber;
                            field.onChange(e.target.value === "" || Number.isNaN(v) ? undefined : v);
                          }}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <p className="text-xs text-muted-foreground">{t("adminManage.rooms.priceHint")}</p>
              <div className="space-y-1">
                <div className="text-sm font-medium">{t("adminManage.rooms.methodsLabel")}</div>
                <div className="flex flex-wrap gap-3">
                  {(
                    [
                      ["whole_room_percent", t("adminManage.rooms.methodPercent")],
                      ["per_attending_student", t("adminManage.rooms.methodPerStudent")],
                    ] as [PricingMethod, string][]
                  ).map(([key, label]) => {
                    const disabled = key === "per_attending_student" && perStudentDisabled;
                    const row = (
                      <label
                        className={`flex items-center gap-2 text-sm ${disabled ? "cursor-not-allowed text-muted-foreground" : ""}`}
                      >
                        <Checkbox
                          checked={methods.includes(key)}
                          disabled={disabled}
                          onCheckedChange={(on) =>
                            setMethods((cur) =>
                              on
                                ? [...cur.filter((m) => m !== key), key]
                                : cur.filter((m) => m !== key),
                            )
                          }
                        />
                        {label}
                      </label>
                    );
                    if (key !== "per_attending_student" || perStudentAvailable) {
                      return <div key={key}>{row}</div>;
                    }
                    return (
                      <TooltipProvider key={key}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div>{row}</div>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-[260px]">
                            {perStudentChecked
                              ? t("adminManage.rooms.methodPerStudentUnavailableEnabled")
                              : t("adminManage.rooms.methodPerStudentUnavailable")}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    );
                  })}
                </div>
                <p className="text-xs text-muted-foreground">
                  {t("adminManage.rooms.methodsHint")}
                </p>
                {!perStudentAvailable && !availabilityReq.query.isLoading ? (
                  <p className="text-xs text-[var(--amber)]">
                    {perStudentChecked
                      ? t("adminManage.rooms.methodPerStudentUnavailableEnabled")
                      : t("adminManage.rooms.methodPerStudentUnavailable")}
                  </p>
                ) : null}
                {perStudentChecked && perStudentAvailable ? (
                  <div className="space-y-1 rounded-md border p-3">
                    <label className="text-sm font-medium" htmlFor="per-student-rate">
                      {t("adminManage.rooms.perStudentRateLabel")}
                    </label>
                    {ceiling ? (
                      <>
                        <div className="flex items-center gap-2">
                          <Input
                            id="per-student-rate"
                            type="number"
                            min={0}
                            max={ceilingValue ?? undefined}
                            step="0.01"
                            inputMode="decimal"
                            value={rateInput}
                            onChange={(e) => setRateInput(e.target.value)}
                            aria-invalid={rateTooHigh || rateMissing}
                            className="max-w-[160px]"
                          />
                          <span className="text-sm text-muted-foreground">
                            {ceilingIsPercent
                              ? t("adminManage.rooms.perStudentRatePercentUnit")
                              : t("adminManage.rooms.perStudentRateFlatUnit")}
                          </span>
                        </div>
                        <p
                          className={`text-xs ${rateTooHigh || rateMissing ? "text-destructive" : "text-muted-foreground"}`}
                        >
                          {rateMissing
                            ? t("adminManage.rooms.perStudentRateRequired")
                            : ceilingIsPercent
                              ? t("adminManage.rooms.perStudentRateMaxPercent", {
                                  max: ceilingValue!,
                                })
                              : t("adminManage.rooms.perStudentRateMaxFlat", { max: ceilingValue! })}
                        </p>
                      </>
                    ) : (
                      <p className="text-sm">
                        {ownRate!.bp != null
                          ? t("adminManage.rooms.perStudentRateFixedPercent", {
                              value: ownRate!.bp / 100,
                            })
                          : t("adminManage.rooms.perStudentRateFixedFlat", {
                              value: ownRate!.fee! / 100,
                            })}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {t("adminManage.rooms.perStudentRateHint")}
                    </p>
                  </div>
                ) : null}
              </div>
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("adminManage.rooms.description")}</FormLabel>
                    <FormControl>
                      <Textarea
                        rows={2}
                        placeholder={t("adminManage.rooms.descriptionPlaceholder")}
                        {...field}
                        value={field.value ?? ""}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="space-y-2">
                <FormLabel>{t("adminManage.rooms.features")}</FormLabel>
                <div className="flex flex-wrap gap-1.5">
                  {ROOM_AMENITIES.map((a) => {
                    const on = facilities.includes(a.key);
                    return (
                      <Button
                        key={a.key}
                        type="button"
                        size="sm"
                        variant={on ? "default" : "outline"}
                        onClick={() => toggleAmenity(a.key)}
                      >
                        {on ? <Check className="size-3" /> : null}
                        {amenityLabel(a.key, locale)}
                      </Button>
                    );
                  })}
                </div>
                <div className="flex gap-2">
                  <Input
                    placeholder={t("adminManage.rooms.featuresPlaceholder")}
                    value={featureDraft}
                    onChange={(e) => setFeatureDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addCustom();
                      }
                    }}
                  />
                  <Button type="button" variant="outline" onClick={addCustom}>
                    {t("adminManage.rooms.addFeature")}
                  </Button>
                </div>
                {customExtras.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {customExtras.map((f) => (
                      <Badge key={f} variant="secondary" className="gap-1">
                        {f}
                        <button type="button" onClick={() => removeFacility(f)} className="hover:text-destructive">
                          <X className="size-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <FormLabel>{t("adminManage.rooms.photos")}</FormLabel>
                {photos.length > 0 && (
                  <div className="grid grid-cols-3 gap-2">
                    {photos.map((url, i) => (
                      <div key={url} className="group relative aspect-video overflow-hidden rounded-md border">
                        <CldImage
                          src={url}
                          alt=""
                          width={320}
                          height={180}
                          responsiveWidths={false}
                          className="h-full w-full object-cover"
                        />
                        {i === 0 ? (
                          <span className="absolute inset-s-1 top-1 rounded bg-primary px-1 text-[10px] text-primary-foreground">
                            {t("adminManage.rooms.coverPhoto")}
                          </span>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => removePhoto(url)}
                          className="absolute inset-e-1 top-1 rounded-full bg-black/60 p-1 text-white opacity-0 transition group-hover:opacity-100"
                          aria-label={t("adminManage.rooms.removePhoto")}
                        >
                          <X className="size-3" />
                        </button>
                        <div className="absolute inset-x-0 bottom-0 flex justify-between bg-black/40 p-0.5 opacity-0 transition group-hover:opacity-100">
                          <button
                            type="button"
                            onClick={() => movePhoto(i, i - 1)}
                            disabled={i === 0}
                            className="rounded p-0.5 text-white disabled:opacity-30"
                            aria-label={t("adminManage.rooms.moveLeft")}
                          >
                            <ChevronLeft className="size-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => movePhoto(i, i + 1)}
                            disabled={i === photos.length - 1}
                            className="rounded p-0.5 text-white disabled:opacity-30"
                            aria-label={t("adminManage.rooms.moveRight")}
                          >
                            <ChevronRight className="size-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {editingId ? (
                  <>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/avif"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void uploadPhoto(f);
                      }}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      disabled={uploading}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      {uploading ? <Spinner /> : <ImagePlus className="size-4" />}
                      {uploading ? t("adminManage.rooms.uploadingPhoto") : t("adminManage.rooms.addPhoto")}
                    </Button>
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {t("adminManage.rooms.photoAfterCreate")}
                  </p>
                )}
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
                  {t("actions.cancel")}
                </Button>
                <Button type="submit" disabled={isSaving}>
                  {isSaving ? <Spinner /> : null}
                  {editingId ? t("adminManage.rooms.update") : t("adminManage.rooms.create")}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RoomDetailsDialog({
  room,
  onOpenChange,
  onEdit,
}: {
  room: Room | null;
  onOpenChange: (open: boolean) => void;
  onEdit: (room: Room) => void;
}) {
  const t = useTranslations();
  const { formatDate, formatEGP, locale } = useFormatters();
  const photos = room?.photos ?? [];
  const feats = room?.facilities ?? [];

  return (
    <Dialog open={!!room} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        {room ? (
          <>
            <DialogHeader>
              <DialogTitle>{room.name}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              {photos.length ? (
                <div className="grid grid-cols-2 gap-2">
                  {photos.map((url, i) => (
                    <div
                      key={url}
                      className={`relative overflow-hidden rounded-md border ${i === 0 ? "col-span-2 aspect-video" : "aspect-video"}`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt="" className="h-full w-full object-cover" />
                      {i === 0 ? (
                        <span className="absolute inset-s-1 top-1 rounded bg-primary px-1 text-[10px] text-primary-foreground">
                          {t("adminManage.rooms.coverPhoto")}
                        </span>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex aspect-video items-center justify-center rounded-md border bg-muted text-sm text-muted-foreground">
                  <ImageIcon className="me-2 size-4" />
                  {t("adminManage.rooms.noPhotos")}
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <DetailRow label={t("adminManage.rooms.capacity")}>
                  {room.capacity != null ? `${room.capacity} ${t("adminManage.rooms.seats")}` : "—"}
                </DetailRow>
                <DetailRow label={t("adminManage.rooms.colPrice")}>
                  {room.price != null ? formatEGP(room.price) : "—"}
                </DetailRow>
                {room.createdAt ? (
                  <DetailRow label={t("adminManage.rooms.colCreated")}>
                    {formatDate(room.createdAt)}
                  </DetailRow>
                ) : null}
              </div>
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">
                  {t("adminManage.rooms.features")}
                </p>
                {feats.length ? (
                  <div className="flex flex-wrap gap-1.5">
                    {feats.map((x) => (
                      <Badge key={x} variant="secondary">
                        {amenityLabel(x, locale)}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">—</p>
                )}
              </div>
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">
                  {t("adminManage.rooms.description")}
                </p>
                <p className="text-sm text-foreground">
                  {room.description?.trim() || t("adminManage.rooms.noDescription")}
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                {t("actions.cancel")}
              </Button>
              <Button onClick={() => onEdit(room)}>
                <Pencil className="size-4" />
                {t("actions.edit")}
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-0.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium text-foreground">{children}</p>
    </div>
  );
}
