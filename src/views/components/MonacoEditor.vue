<template>
  <div ref="monaco-editor" style="border: 1px solid #52525e; border-radius: 0.25rem;"></div>
</template>

<script>
import loader from "@monaco-editor/loader";

export default {
  name: "MonacoEditor",
  props: {
    value: String,
  },
  data() {
    return {
      editor: null,
      editorModel: null,
    }
  },
  mounted() {
    loader.init().then(monaco => {
      monaco.editor.create(this.$refs["monaco-editor"], {
        bracketPairColorization: true,
        language: "javascript",
        matchBrackets: true,
        minimap: {
          enabled: false,
        },
        lineNumbersMinChars: 3,
        overviewRulerLanes: 0,
        scrollBeyondLastLine: false,
        theme: "vs-dark",
        wordWrap: "on",
        wrappingStrategy: "advanced",
      });

      this.editor = monaco.editor.getEditors()[0];
      this.editorModel = monaco.editor.getModels()[0];

      this.editor.onDidContentSizeChange(this.handleContentSizeChange);
      this.editorModel.onDidChangeContent(this.handleContentChange);
      this.editorModel.setValue(this.value);
    })
  },
  beforeDestroy() {
    if (this.editor) {
      this.editor.dispose();
    }
  },
  methods: {
    handleContentChange: function () {
      this.value = this.editor.getValue();
      this.$emit("input", this.value);
    },
    handleContentSizeChange: function () {
      const contentHeight = Math.min(1000, this.editor.getContentHeight());
      this.$refs["monaco-editor"].style.height = `${contentHeight}px`;
      this.editor.layout({
        width: this.$refs["monaco-editor"].clientWidth,
        height: contentHeight,
      });
    },
  }
}
</script>
