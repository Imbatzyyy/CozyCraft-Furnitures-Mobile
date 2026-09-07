import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, expect, it, vi } from "vitest"
import SearchDiscoveries, { discoveryNames } from "./SearchDiscoveries"
afterEach(cleanup)
it("uses up to four nonempty distinct catalog names", () => {
  expect(discoveryNames([{name:" "},{name:" VIMLE "},{name:"vimle"},{name:"ODGER"},{name:"EKOLSUND"},{name:"NÄMMARÖ"},{name:"Extra"}])).toEqual(["VIMLE","ODGER","EKOLSUND","NÄMMARÖ"])
})
it("sends the actual product name to the existing search handler", () => {
  const select = vi.fn()
  render(<SearchDiscoveries products={[{name:"LYCKSELE LÖVÅS"}]} select={select}/>)
  fireEvent.click(screen.getByRole("button", {name:"Search for LYCKSELE LÖVÅS"}))
  expect(select).toHaveBeenCalledExactlyOnceWith("LYCKSELE LÖVÅS")
})
it("does not offer invented searches while the catalog is empty", () => {
  const {container} = render(<SearchDiscoveries products={[]} select={() => {}}/>)
  expect(container.childElementCount).toBe(0)
})
