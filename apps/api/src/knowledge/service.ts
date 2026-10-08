/** A piece of the user's own material (an application, a resume version, an interview record, an attachment) shown as an answer's source. */
export interface KnowledgeEntry {
  id: string;
  sourceId: string;
  title: string;
  content: string;
  url?: string;
}
