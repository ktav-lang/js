>>>>> lang=en
```ktav
servers: [{host: new, keep: yes}, standby]
```

#### 4. A numeric-looking String stays a String

The replacement is a String, not an Integer. The raw marker preserves that distinction. Supply a typed Integer when a numeric value is intended.

```ts
const source = "port: 8080\n";
const updated = editValue(source, "port", "9090");
```

Result:

```ktav
port:: 9090
```

#### 5. Multiline replacement: expand only what is necessary

The changed array expands with four-space indentation. The untouched object stays inline, and verbatim string contents are not reindented.

```ts
const source = "a: [old, {keep: yes}]\n";
const updated = editValue(source, "a.0", "x\ny");
```

Result:

>>>>> lang=ru
```ktav
servers: [{host: new, keep: yes}, standby]
```

#### 4. Похожая на число строка остаётся строкой

Замена имеет тип String, а не Integer. Raw-маркер сохраняет это различие. Для числового значения передавайте типизированный Integer.

```ts
const source = "port: 8080\n";
const updated = editValue(source, "port", "9090");
```

Результат:

```ktav
port:: 9090
```

#### 5. Многострочная замена: раскрывается только необходимое

Изменённый массив раскрывается с отступом четыре пробела. Нетронутый объект остаётся inline, содержимое verbatim-строки не переотступается.

```ts
const source = "a: [old, {keep: yes}]\n";
const updated = editValue(source, "a.0", "x\ny");
```

Результат:

>>>>> lang=zh
```ktav
servers: [{host: new, keep: yes}, standby]
```

#### 4. 看似数字的字符串仍然是字符串

替换值是 String，而不是 Integer。raw 标记保留这种区别；需要数值时请传入类型化 Integer。

```ts
const source = "port: 8080\n";
const updated = editValue(source, "port", "9090");
```

结果:

```ktav
port:: 9090
```

#### 5. 多行替换：仅展开必要的容器

修改的数组以四空格缩进展开。未修改的对象保持行内形式，verbatim 字符串内容不会重新缩进。

```ts
const source = "a: [old, {keep: yes}]\n";
const updated = editValue(source, "a.0", "x\ny");
```

结果:

