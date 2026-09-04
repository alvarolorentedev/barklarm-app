type AppRPCSchema = {
  bun: {
    requests: {
      getStore: { params: { key: string }; response: any };
      setStore: { params: { key: string; value: any }; response: boolean };
      refreshObservers: { params: null; response: boolean };
      importConfig: { params: { filePath: string }; response: boolean };
      exportConfig: { params: { filePath: string }; response: boolean };
      quit: { params: null; response: boolean };
    };
  };
  webview: {
    requests: Record<string, never>;
  };
};

export default AppRPCSchema;
