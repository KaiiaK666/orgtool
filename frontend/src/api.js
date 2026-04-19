const DEFAULT_API_HOST = "http://localhost:8124";
const DEFAULT_API_NAMESPACE = "/orgtool";

const apiHost = (import.meta.env.VITE_API_HOST || import.meta.env.VITE_API_BASE || DEFAULT_API_HOST).replace(/\/$/, "");
const apiNamespace = String(import.meta.env.VITE_API_NAMESPACE ?? DEFAULT_API_NAMESPACE).replace(/\/$/, "");

export const apiBase = `${apiHost}${apiNamespace}`;

async function request(path, options = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  if (!response.ok) {
    let message = "Request failed";
    try {
      const data = await response.json();
      message = data.detail || message;
    } catch {
      message = response.statusText || message;
    }
    throw new Error(message);
  }

  return response.json();
}

function unwrap(key) {
  return async (...args) => {
    const data = await args[0];
    return key ? data[key] : data;
  };
}

export function getBootstrap() {
  return request("/api/bootstrap");
}

export function login(payload) {
  return request("/api/login", { method: "POST", body: JSON.stringify(payload) });
}

export function createStore(payload) {
  return request("/api/stores", { method: "POST", body: JSON.stringify(payload) }).then(unwrap("store"));
}

export function updateStore(storeId, payload) {
  return request(`/api/stores/${storeId}`, { method: "PATCH", body: JSON.stringify(payload) }).then(unwrap("store"));
}

export function createUser(payload) {
  return request("/api/users", { method: "POST", body: JSON.stringify(payload) }).then(unwrap("user"));
}

export function updateUser(userId, payload) {
  return request(`/api/users/${userId}`, { method: "PATCH", body: JSON.stringify(payload) }).then(unwrap("user"));
}

export function deleteUser(userId) {
  return request(`/api/users/${userId}`, { method: "DELETE" });
}

export function createAnnouncement(payload) {
  return request("/api/announcements", { method: "POST", body: JSON.stringify(payload) }).then(unwrap("announcement"));
}

export function updateAnnouncement(announcementId, payload) {
  return request(`/api/announcements/${announcementId}`, { method: "PATCH", body: JSON.stringify(payload) }).then(unwrap("announcement"));
}

export function updatePermission(role, payload) {
  return request(`/api/settings/permissions/${encodeURIComponent(role)}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  }).then(unwrap("permission"));
}

export function createBoard(payload) {
  return request("/api/boards", { method: "POST", body: JSON.stringify(payload) }).then(unwrap("board"));
}

export function updateBoard(boardId, payload) {
  return request(`/api/boards/${boardId}`, { method: "PATCH", body: JSON.stringify(payload) }).then(unwrap("board"));
}

export function createBoardField(boardId, payload) {
  return request(`/api/boards/${boardId}/fields`, { method: "POST", body: JSON.stringify(payload) }).then(unwrap("field"));
}

export function createGroup(payload) {
  return request("/api/groups", { method: "POST", body: JSON.stringify(payload) }).then(unwrap("group"));
}

export function createTask(payload) {
  return request("/api/tasks", { method: "POST", body: JSON.stringify(payload) }).then(unwrap("task"));
}

export function updateTask(boardId, taskId, payload) {
  return request(`/api/boards/${boardId}/tasks/${taskId}`, { method: "PATCH", body: JSON.stringify(payload) }).then(unwrap("task"));
}
