
export const getProtocol = () => {
   return window.location.hostname === "localhost"? "http": "https"
}