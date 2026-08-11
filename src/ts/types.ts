
export type Config = {
    skin:   "1" | "2" | "3";
    /** "quare" は square の綴り間違い。保存済みの設定と非互換になるため値は据え置き。
     *  表示ラベルだけ src/i18n/ui/ の shape.square で正しい綴りにしている */
    shape:  "round" | "quare";
    size:   number;
    zoom:   number;
    cursor: string;
}
