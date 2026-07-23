import { createFileRoute } from "@tanstack/react-router";


const EXT_MIME: Record<string, string> = {
  pdf: "application/pdf",
  zip: "application/zip",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  txt: "text/plain",
  csv: "text/csv",
  rtf: "application/rtf",
  odt: "application/vnd.oasis.opendocument.text",
  ods: "application/vnd.oasis.opendocument.spreadsheet",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
};

const MIME_EXT: Record<string, string> = {
  "application/pdf": "pdf",
  "application/zip": "zip",
  "application/x-zip-compressed": "zip",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.ms-powerpoint": "ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "text/plain": "txt",
  "text/csv": "csv",
  "image/png": "png",
  "image/jpeg": "jpg",
};

function sniffExt(u8: Uint8Array): string | null {
  if (u8.length >= 4 && u8[0] === 0x25 && u8[1] === 0x50 && u8[2] === 0x44 && u8[3] === 0x46) return "pdf";
  if (u8.length >= 4 && u8[0] === 0x50 && u8[1] === 0x4b && (u8[2] === 0x03 || u8[2] === 0x05 || u8[2] === 0x07)) return "zip";
  if (u8.length >= 8 && u8[0] === 0xd0 && u8[1] === 0xcf && u8[2] === 0x11 && u8[3] === 0xe0) return "doc";
  return null;
}

function sanitizeFilename(name: string): string {
  return name
    .replace(/[\r\n"\\/]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180) || "dokument";
}

function splitNameExt(name: string): { base: string; ext: string | null } {
  const m = /^(.+)\.([A-Za-z0-9]{1,6})$/.exec(name);
  if (!m) return { base: name, ext: null };
  return { base: m[1], ext: m[2].toLowerCase() };
}

export const Route = createFileRoute("/api/public/grant-doc/$uuid")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const uuid = params.uuid;
        if (!/^[0-9a-f-]{36}$/i.test(uuid)) {
          return new Response("Bad uuid", { status: 400 });
        }

        const url = new URL(request.url);
        const rawName = url.searchParams.get("name") ?? "";

        // Look up doc metadata by uuid to derive filename + verify it exists
        const supa = createClient(
          process.env.SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
          { auth: { persistSession: false } },
        );

        let nazov = rawName;
        let kod = "";
        let ordinal = 0;
        try {
          const { data: rows } = await supa
            .from("grant_calls")
            .select("kod, documents")
            .contains("documents", [{ uuid }])
            .limit(1);
          const row = rows?.[0];
          if (row) {
            kod = String(row.kod ?? "");
            const docs = (row.documents ?? []) as Array<{ uuid: string; nazov?: string }>;
            const idx = docs.findIndex((d) => d.uuid === uuid);
            if (idx >= 0) {
              ordinal = idx + 1;
              if (!nazov) nazov = docs[idx]?.nazov ?? "";
            }
          }
        } catch (e) {
          console.error("grant-doc lookup failed", e);
        }

        // Fetch the source
        const upstream = await fetch(`https://api.itms21.sk/public/v1/dokument/${uuid}`);
        if (!upstream.ok || !upstream.body) {
          return new Response(`Upstream ${upstream.status}`, { status: 502 });
        }

        const buf = new Uint8Array(await upstream.arrayBuffer());
        const upstreamMime = (upstream.headers.get("content-type") ?? "")
          .split(";")[0]
          .trim()
          .toLowerCase();

        // Derive extension: name → mime → sniffed bytes
        let ext: string | null = null;
        if (nazov) ext = splitNameExt(nazov).ext;
        if (!ext && upstreamMime) ext = MIME_EXT[upstreamMime] ?? null;
        if (!ext) ext = sniffExt(buf);
        ext = ext ?? "bin";

        // Derive filename
        let filename: string;
        if (nazov) {
          const { base, ext: nameExt } = splitNameExt(nazov);
          filename = nameExt ? sanitizeFilename(nazov) : `${sanitizeFilename(base)}.${ext}`;
        } else {
          const stem = kod
            ? `${kod}-dokument-${ordinal || 1}`
            : `dokument-${uuid.slice(0, 8)}`;
          filename = `${sanitizeFilename(stem)}.${ext}`;
        }

        const mime = EXT_MIME[ext] ?? upstreamMime ?? "application/octet-stream";

        // RFC 5987 encoded filename for non-ASCII
        const asciiName = filename.replace(/[^\x20-\x7E]/g, "_");
        const utf8Name = encodeURIComponent(filename);

        return new Response(buf, {
          status: 200,
          headers: {
            "Content-Type": mime,
            "Content-Length": String(buf.byteLength),
            "Content-Disposition": `attachment; filename="${asciiName}"; filename*=UTF-8''${utf8Name}`,
            "Cache-Control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
