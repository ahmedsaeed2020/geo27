import { createFileRoute } from "@tanstack/react-router";
import { ContactListPage } from "@/plugins/digit_crm/ContactList";

export const Route = createFileRoute("/digit-crm/contacts")({
  head: () => ({ meta: [
    { title: "Contacts — DIGIT CRM" }, { name: "description", content: "Contacts with relationship, owner, last activity, next step and channel consent." },
    { property: "og:title", content: "Contacts — DIGIT CRM" }, { property: "og:description", content: "Contacts with relationship, owner, last activity, next step and channel consent." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: ContactListPage,
});
