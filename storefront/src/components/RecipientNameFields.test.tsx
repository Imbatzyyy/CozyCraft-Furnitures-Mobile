import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import RecipientNameFields, { splitRecipientName } from "./RecipientNameFields"

describe("recipient fields", () => {
  it("preserves legacy full names and single names", () => {
    expect(splitRecipientName("  Ana Maria de la Cruz ")).toEqual({ first: "Ana", last: "Maria de la Cruz" })
    expect(splitRecipientName("Kiansz")).toEqual({ first: "Kiansz", last: "" })
  })
  it("saves both editable fields into the database recipient name without losing compound names", () => {
    const save = vi.fn()
    render(<RecipientNameFields value="Ana Cruz" onChange={save} />)
    fireEvent.change(screen.getByLabelText("First name"), { target: { value: "Ana Maria" } })
    fireEvent.change(screen.getByLabelText("Last name"), { target: { value: "de la Cruz" } })
    expect(save).toHaveBeenLastCalledWith("Ana Maria de la Cruz")
    fireEvent.change(screen.getByLabelText("First name"), { target: { value: "" } })
    expect(save).toHaveBeenLastCalledWith("")
  })
})
