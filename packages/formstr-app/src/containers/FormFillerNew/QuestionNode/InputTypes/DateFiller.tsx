import { DatePicker, DatePickerProps } from "antd";
import dayjs from "dayjs";
import { RangePickerProps } from "antd/es/date-picker";

interface DateFillerProps {
  onChange: (value: string) => void;
  defaultValue?: string;
  fieldConfig?: any;
}

export const DateFiller: React.FC<DateFillerProps> = ({
  onChange,
  defaultValue,
  fieldConfig,
}) => {
  const handleChange: DatePickerProps["onChange"] = (date, dateString) => {
    onChange(dateString);
  };
  const disabledDate = (current: dayjs.Dayjs) => {
    if (fieldConfig?.disableFuture) {
      return current && current > dayjs().endOf('day');
    }
    return false;
  };

  return (
    <>
      <DatePicker
        onChange={handleChange}
        defaultValue={defaultValue ? dayjs(defaultValue) : undefined}
        disabledDate={disabledDate}
      />
    </>
  );
};
