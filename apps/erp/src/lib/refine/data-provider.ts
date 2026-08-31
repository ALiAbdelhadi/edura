import type {
  DataProvider,
  GetListParams,
  GetOneParams,
  CreateParams,
  UpdateParams,
  DeleteOneParams,
  GetManyParams,
  CreateManyParams,
  UpdateManyParams,
  DeleteManyParams,
  CustomParams,
  BaseRecord,
  HttpError,
  GetListResponse,
  GetOneResponse,
  CreateResponse,
  UpdateResponse,
  DeleteOneResponse,
  GetManyResponse,
  CreateManyResponse,
  UpdateManyResponse,
  DeleteManyResponse,
  CustomResponse,
} from "@refinedev/core";
import { api } from "@/lib/api/client";
import { localizeApiError } from "@repo/ui/lib/api-error";
import type { KyInstance } from "ky";

const RESOURCE_MAP: Record<string, string> = {
  students: "roster/students",
  teachers: "roster/teachers",
  courses: "courses",
  grades: "grades",
  payments: "payments",
  sessions: "sessions",
  enrollments: "enrollments",
  expenses: "expenses",
  rooms: "rooms",
  "enrollment-requests": "enrollment-requests",
  reports: "reports",
  "me-children": "me/children",
  "me-attendance": "me/attendance",
  "dashboards-student": "dashboards/student",
  "dashboards-teacher": "dashboards/teacher",
  "dashboards-admin": "dashboards/admin",
  materials: "materials",
  notifications: "notifications",
  "parent-links": "parent-links",
  reviews: "reviews",
  "me-affiliations": "me/affiliations",
};

function resolveResource(resource: string): string {
  return RESOURCE_MAP[resource] || resource;
}

function buildQueryString(params: {
  pagination?: GetListParams["pagination"];
  sorters?: GetListParams["sorters"];
  filters?: GetListParams["filters"];
}): string {
  const search = new URLSearchParams();

  if (params.pagination?.mode !== "off") {
    if (params.pagination?.currentPage) {
      search.set("page", String(params.pagination.currentPage));
    }
    if (params.pagination?.pageSize) {
      search.set("pageSize", String(params.pagination.pageSize));
    }
  }

  if (params.sorters && params.sorters.length > 0) {
    params.sorters.forEach((s) => {
      search.set("sort", `${s.field}:${s.order}`);
    });
  }

  if (params.filters && params.filters.length > 0) {
    params.filters.forEach((f) => {
      if ("field" in f) {
        search.set(f.field, String(f.value));
      }
    });
  }

  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

function extractListData<T>(response: unknown): T {
  if (typeof response === "object" && response !== null && "data" in response) {
    const data = (response as { data: unknown }).data;
    if (typeof data === "object" && data !== null && "items" in data) {
      return (data as { items: T }).items;
    }
    return data as T;
  }
  return response as T;
}

function mapError(error: any): HttpError {
  const localized = localizeApiError(error);
  return {
    message: localized.message,
    statusCode: localized.statusCode,
    errors: localized.fields,
    serverMessage: localized.serverMessage,
  };
}

export const dataProvider: DataProvider = {
  getList: async <TData extends BaseRecord = BaseRecord>({
    resource,
    pagination,
    sorters,
    filters,
  }: GetListParams): Promise<GetListResponse<TData>> => {
    const url = `${resolveResource(resource)}${buildQueryString({ pagination, sorters, filters })}`;
    try {
      const response = await api.get(url).json<{ data: TData[] | { items: TData[] }; meta?: { total?: number } }>();
      const data = extractListData<TData[]>(response);
      const total = response.meta?.total ?? data.length;
      return { data, total };
    } catch (error) {
      throw mapError(error);
    }
  },

  getOne: async <TData extends BaseRecord = BaseRecord>({
    resource,
    id,
  }: GetOneParams): Promise<GetOneResponse<TData>> => {
    try {
      const response = await api.get(`${resolveResource(resource)}/${id}`).json<{ data: TData }>();
      return { data: response.data };
    } catch (error) {
      throw mapError(error);
    }
  },

  getMany: async <TData extends BaseRecord = BaseRecord>({
    resource,
    ids,
  }: GetManyParams): Promise<GetManyResponse<TData>> => {
    try {
      const search = new URLSearchParams();
      ids.forEach((id) => search.append("id", String(id)));
      const response = await api
        .get(`${resolveResource(resource)}?${search.toString()}`)
        .json<{ data: TData[] | { items: TData[] } }>();
      const data = extractListData<TData[]>(response);
      return { data };
    } catch (error) {
      throw mapError(error);
    }
  },

  create: async <TData extends BaseRecord = BaseRecord, TVariables = {}>({
    resource,
    variables,
  }: CreateParams<TVariables>): Promise<CreateResponse<TData>> => {
    try {
      const response = await api
        .post(resolveResource(resource), { json: variables })
        .json<{ data: TData }>();
      return { data: response.data };
    } catch (error) {
      throw mapError(error);
    }
  },

  createMany: async <TData extends BaseRecord = BaseRecord, TVariables = {}>({
    resource,
    variables,
  }: CreateManyParams<TVariables>): Promise<CreateManyResponse<TData>> => {
    try {
      const results = await Promise.all(
        variables.map((v) =>
          api.post(resolveResource(resource), { json: v }).json<{ data: TData }>(),
        ),
      );
      return { data: results.map((r) => r.data) };
    } catch (error) {
      throw mapError(error);
    }
  },

  update: async <TData extends BaseRecord = BaseRecord, TVariables = {}>({
    resource,
    id,
    variables,
  }: UpdateParams<TVariables>): Promise<UpdateResponse<TData>> => {
    try {
      const response = await api
        .patch(`${resolveResource(resource)}/${id}`, { json: variables })
        .json<{ data: TData }>();
      return { data: response.data };
    } catch (error) {
      throw mapError(error);
    }
  },

  updateMany: async <TData extends BaseRecord = BaseRecord, TVariables = {}>({
    resource,
    ids,
    variables,
  }: UpdateManyParams<TVariables>): Promise<UpdateManyResponse<TData>> => {
    try {
      const results = await Promise.all(
        ids.map((id) =>
          api.patch(`${resolveResource(resource)}/${id}`, { json: variables }).json<{ data: TData }>(),
        ),
      );
      return { data: results.map((r) => r.data) };
    } catch (error) {
      throw mapError(error);
    }
  },

  deleteOne: async <TData extends BaseRecord = BaseRecord, TVariables = {}>({
    resource,
    id,
  }: DeleteOneParams<TVariables>): Promise<DeleteOneResponse<TData>> => {
    try {
      const response = await api
        .delete(`${resolveResource(resource)}/${id}`)
        .json<{ data: TData }>();
      return { data: response.data };
    } catch (error) {
      throw mapError(error);
    }
  },

  deleteMany: async <TData extends BaseRecord = BaseRecord, TVariables = {}>({
    resource,
    ids,
  }: DeleteManyParams<TVariables>): Promise<DeleteManyResponse<TData>> => {
    try {
      await Promise.all(ids.map((id) => api.delete(`${resolveResource(resource)}/${id}`)));
      return { data: [] as TData[] };
    } catch (error) {
      throw mapError(error);
    }
  },

  custom: async <TData extends BaseRecord = BaseRecord, TQuery = unknown, TPayload = unknown>({
    url,
    method,
    payload,
    query,
  }: CustomParams<TQuery, TPayload>): Promise<CustomResponse<TData>> => {
    try {
      let search = "";
      if (query) {
        const params = new URLSearchParams();
        Object.entries(query as Record<string, unknown>).forEach(([k, v]) => {
          if (v !== undefined && v !== null) params.set(k, String(v));
        });
        search = params.toString();
      }
      const fullUrl = search ? `${url}?${search}` : url;

      let response: { data: TData };
      switch (method) {
        case "get":
          response = await api.get(fullUrl, payload ? { json: payload } : undefined).json();
          break;
        case "post":
          response = await api.post(fullUrl, payload ? { json: payload } : undefined).json();
          break;
        case "put":
          response = await api.put(fullUrl, payload ? { json: payload } : undefined).json();
          break;
        case "patch":
          response = await api.patch(fullUrl, payload ? { json: payload } : undefined).json();
          break;
        case "delete":
          response = await api.delete(fullUrl, payload ? { json: payload } : undefined).json();
          break;
        default:
          throw new Error(`Unsupported method: ${method}`);
      }
      return { data: response.data };
    } catch (error) {
      throw mapError(error);
    }
  },

  getApiUrl: () => "/api/v1",
};
