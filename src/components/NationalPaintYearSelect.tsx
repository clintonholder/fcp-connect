import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/** Year picker over this year -2 .. +2, shared by the Revenue and Dashboard pages. */
export function NationalPaintYearSelect({
  id,
  year,
  onChange,
  thisYear,
}: {
  id: string;
  year: number;
  onChange: (year: number) => void;
  thisYear: number;
}) {
  const years = [thisYear - 2, thisYear - 1, thisYear, thisYear + 1, thisYear + 2];
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>Year</Label>
      <Select value={String(year)} onValueChange={(v) => onChange(Number(v))}>
        <SelectTrigger id={id} className="w-32">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {years.map((y) => (
            <SelectItem key={y} value={String(y)}>
              {y}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
