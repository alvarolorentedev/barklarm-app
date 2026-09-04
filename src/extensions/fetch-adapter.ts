export const fetchWrapper = (url: string, options: any) => {
  // Use global fetch
  return fetch(url, options);
};
