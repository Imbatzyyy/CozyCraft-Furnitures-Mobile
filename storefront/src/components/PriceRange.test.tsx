import { useState } from "react"
import { fireEvent, render, screen } from "@testing-library/react"
import { expect, it } from "vitest"
import PriceRange, { clampPriceRange } from "./PriceRange"
it("moves both price handles independently and prevents crossing", () => {
  function Fixture() { const [range, setRange] = useState([0,500000]); return <PriceRange minimum={range[0]} maximum={range[1]} change={(a,b)=>setRange([a,b])} /> }
  render(<Fixture />)
  fireEvent.change(screen.getByRole("slider",{name:"Minimum price"}),{target:{value:"10000"}})
  fireEvent.change(screen.getByRole("slider",{name:"Maximum price"}),{target:{value:"30000"}})
  expect(screen.getByText("₱10,000")).toBeTruthy()
  expect(screen.getByText("₱30,000")).toBeTruthy()
  fireEvent.change(screen.getByRole("slider",{name:"Minimum price"}),{target:{value:"50000"}})
  expect(screen.getByText("₱29,500")).toBeTruthy()
  expect(clampPriceRange(0,29500,"max")).toBe(30000)
})
