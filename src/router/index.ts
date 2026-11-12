import { createRouter, createWebHistory } from "vue-router";

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: "/",
      name: "home",
      component: () => import("@/views/HomeView.vue"),
    },
    {
      path: "/room/:code",
      name: "room",
      component: () => import("@/views/RoomView.vue"),
      // El código de sala se valida contra el backend recién en la Fase 3
      // (sistema de salas). Por ahora la ruta solo existe para poder
      // maquetar la vista de sala de forma aislada.
      props: true,
    },
  ],
});

export default router;
