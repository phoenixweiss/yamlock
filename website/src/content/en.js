export const content = {
  principles: [
    {
      marker: "select",
      title: "Point at the values, not the whole file.",
      text: "Exact paths and structural patterns let readable configuration stay readable.",
      example: "db.password, services.**",
    },
    {
      marker: "bind",
      title: "The path becomes part of the lock.",
      text: "Move a v2 payload to another field and authentication fails closed.",
      example: "api.token ≠ database.password",
    },
    {
      marker: "migrate",
      title: "See the change before touching the source.",
      text: "Dry runs, separate outputs and explicit backups keep migration reviewable.",
      example: "yamlock migrate --dry-run",
    },
  ],
};
