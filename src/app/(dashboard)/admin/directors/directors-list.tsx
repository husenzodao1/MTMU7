"use client";

import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { deleteDirectorAction, toggleDirectorVisibilityAction } from "./actions";
import { Trash2, Eye, EyeOff } from "lucide-react";

interface DirectorsListProps {
  directors: Array<Record<string, unknown>>;
}

export function DirectorsList({ directors }: DirectorsListProps) {
  const t = useTranslations("admin");
  const tc = useTranslations("common");

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("directorsList")}</CardTitle>
      </CardHeader>
      <CardContent>
        {directors.length === 0 ? (
          <p className="text-sm text-neutral-500">{tc("noData")}</p>
        ) : (
          <div className="space-y-3">
            {directors.map((d, i) => (
              <div
                key={String(d.id)}
                className="flex items-center justify-between rounded-lg border border-neutral-200 p-3 animate-list-item"
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <div className="flex items-center gap-3 min-w-0">
                  {d.photo_url ? (
                    <img
                      src={String(d.photo_url)}
                      alt={String(d.full_name_tg)}
                      className="h-10 w-10 shrink-0 rounded-full object-cover"
                    />
                  ) : (
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-100 text-sm font-bold text-primary-700">
                      {String(d.full_name_tg).charAt(0)}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="font-medium text-neutral-900 truncate">{String(d.full_name_tg)}</p>
                    <p className="text-xs text-neutral-500">
                      {String(d.position_tg)} · {String(d.year_start)}–{d.year_end ? String(d.year_end) : "..."}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <form action={toggleDirectorVisibilityAction.bind(null, String(d.id), !d.is_visible)}>
                    <Button variant="ghost" size="icon" className="press-scale">
                      {d.is_visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4 text-neutral-400" />}
                    </Button>
                  </form>
                  <form action={deleteDirectorAction.bind(null, String(d.id))}>
                    <Button variant="ghost" size="icon" className="text-error-600 press-scale">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
