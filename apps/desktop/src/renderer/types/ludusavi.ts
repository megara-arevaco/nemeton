export type LudusaviSuggestion = Awaited<
  ReturnType<Window["launcher"]["searchLudusavi"]>
>[number];
