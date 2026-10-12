import { memo, useMemo } from "react";
import { ScrollView, View } from "react-native";
import { markdownMathRanges } from "@t3tools/shared/markdownMath";

import { AppText } from "../../components/AppText";
import { SelectableMarkdownText } from "../../native/SelectableMarkdownText";
import { useMarkdownPreviewStyles } from "../files/FileMarkdownPreview";

/** Native composition keeps source editing and previews completed formulas in the draft. */
export const ComposerMathPreview = memo(function ComposerMathPreview(props: {
  readonly source: string;
}) {
  const hasMath = useMemo(() => markdownMathRanges(props.source).length > 0, [props.source]);
  const styles = useMarkdownPreviewStyles();
  if (!hasMath) return null;
  return (
    <View className="mt-2 border-t border-border pt-2">
      <AppText className="mb-1 text-xs text-foreground-muted">Math preview</AppText>
      <ScrollView
        style={{ maxHeight: 140 }}
        nestedScrollEnabled
        keyboardShouldPersistTaps="handled"
      >
        <SelectableMarkdownText
          markdown={props.source}
          textStyle={styles.nativeTextStyle}
          preserveSoftBreaks
        />
      </ScrollView>
    </View>
  );
});
