"use client";

import { useState, useMemo } from "react";
import { useList, useCreate, useUpdate, useDelete } from "@refinedev/core";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Home, Pencil, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useFormatters } from "@/lib/i18n/use-formatters";
import { Card, CardContent } from "@repo/ui/components/card";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@repo/ui/components/dialog";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@repo/ui/components/form";
import { toast } from "@repo/ui/components/sonner";
import { DataTable, type ColumnDef } from "@/components/kit/data-table";
import { StatCard } from "@/components/kit/stat-card";
import { ConfirmDialog } from "@/components/kit/confirm-dialog";
import { EmptyState } from "@/components/kit/empty-state";
import { PageHeader } from "@/components/kit/page-header";
import { PageSpinner, Spinner } from "@/components/kit/spinner";

type Room = {
  id?: string;
  _id?: string;
  name: string;
  capacity?: number | null;
  createdAt?: string;
};

export function AdminRoomsScreen() {
  const t = useTranslations();
  const { formatDate } = useFormatters();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const { query, result } = useList({ resource: "rooms" });
  const { mutate: createRoom, mutation: createMutation } = useCreate();
  const { mutate: updateRoom, mutation: updateMutation } = useUpdate();
  const { mutate: deleteRoom, mutation: deleteMutation } = useDelete();

  const rooms = (result?.data ?? []) as Room[];

  const schema = useMemo(
    () =>
      z.object({
        name: z.string().min(1, t("adminManage.rooms.roomNameRequired")),
        capacity: z.number().min(1).optional(),
      }),
    [t],
  );

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", capacity: undefined },
  });

  const handleOpenChange = (open: boolean) => {
    setIsModalOpen(open);
    if (!open) {
      form.reset({ name: "", capacity: undefined });
    }
  };

  const handleOpenCreate = () => {
    setEditingId(null);
    form.reset({ name: "", capacity: undefined });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (room: Room) => {
    setEditingId(room.id || room._id || null);
    form.reset({ name: room.name, capacity: room.capacity ?? undefined });
    setIsModalOpen(true);
  };

  const handleSubmit = (values: { name: string; capacity?: number }) => {
    if (editingId) {
      updateRoom(
        { resource: "rooms", id: editingId, values },
        {
          onSuccess: () => {
            toast.success(t("adminManage.rooms.roomUpdated"));
            setIsModalOpen(false);
            form.reset({ name: "", capacity: undefined });
          },
          onError: (err: any) => {
            toast.error(err?.message || t("adminManage.rooms.failedUpdate"));
          },
        }
      );
    } else {
      createRoom(
        { resource: "rooms", values },
        {
          onSuccess: () => {
            toast.success(t("adminManage.rooms.roomCreated"));
            setIsModalOpen(false);
            form.reset({ name: "", capacity: undefined });
          },
          onError: (err: any) => {
            toast.error(err?.message || t("adminManage.rooms.failedCreate"));
          },
        }
      );
    }
  };

  const handleDelete = (id: string) => {
    deleteRoom(
      { resource: "rooms", id },
      {
        onSuccess: () => {
          toast.success(t("adminManage.rooms.roomDeleted"));
        },
        onError: (err: any) => {
          toast.error(err?.message || t("adminManage.rooms.failedDelete"));
        },
      }
    );
  };

  const columns: ColumnDef<Room>[] = [
    {
      accessorKey: "name",
      header: t("adminManage.rooms.colName"),
    },
    {
      accessorKey: "capacity",
      header: t("adminManage.rooms.capacity"),
      cell: ({ row }) => row.original.capacity ?? "—",
    },
    {
      accessorKey: "createdAt",
      header: t("adminManage.rooms.colCreated"),
      cell: ({ row }) =>
        row.original.createdAt ? formatDate(row.original.createdAt) : "—",
    },
    {
      id: "actions",
      header: t("adminManage.rooms.colActions"),
      cell: ({ row }) => {
        const record = row.original;
        const id = record.id || record._id || "";
        return (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleOpenEdit(record)}
            >
              <Pencil className="size-4" />
              {t("actions.edit")}
            </Button>
            <ConfirmDialog
              trigger={
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
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
        );
      },
    },
  ];

  const modalTitle = editingId
    ? t("adminManage.rooms.editRoom")
    : t("adminManage.rooms.addRoom");
  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("nav.rooms")}
        actions={
          <Button onClick={handleOpenCreate}>
            <Plus className="size-4" />
            {t("adminManage.rooms.addRoom")}
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          accent
          label={t("adminManage.rooms.totalRooms")}
          value={rooms.length}
          icon={Home}
        />
      </div>

      <Card>
        <CardContent>
          {query.isLoading ? (
            <PageSpinner />
          ) : (
            <DataTable
              columns={columns}
              data={rooms}
              pageSize={10}
              emptyState={
                <EmptyState
                  icon={Home}
                  title={t("adminManage.rooms.emptyText")}
                />
              }
            />
          )}
        </CardContent>
      </Card>

      <Dialog open={isModalOpen} onOpenChange={handleOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{modalTitle}</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(handleSubmit)}
              autoComplete="off"
              className="space-y-4"
            >
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("adminManage.rooms.roomName")}</FormLabel>
                    <FormControl>
                      <Input
                        placeholder={t("adminManage.rooms.roomNamePlaceholder")}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

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
                          field.onChange(
                            e.target.value === "" || Number.isNaN(v)
                              ? undefined
                              : v,
                          );
                        }}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleOpenChange(false)}
                >
                  {t("actions.cancel")}
                </Button>
                <Button type="submit" disabled={isSaving}>
                  {isSaving ? <Spinner /> : null}
                  {editingId
                    ? t("adminManage.rooms.update")
                    : t("adminManage.rooms.create")}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
