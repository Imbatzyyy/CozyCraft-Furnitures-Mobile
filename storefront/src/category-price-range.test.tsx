import { fireEvent, render, screen } from "@testing-library/react"
import { expect, it } from "vitest"
import { ShopPage } from "./Storefront"
for (const room of ["living", "bedroom", "dining"] as const) it(`filters both price bounds and resets in ${room}`, () => {
  const products = [1000,15000,75000].map(price => ({ id: String(price), room, name: `Piece ${price}`, category: room, price: `₱${price}`, image:"/fixture.png", alt:"Furniture" }))
  render(<ShopPage products={products} roomId={room} subcategory="" setRoom={()=>{}} setSubcategory={()=>{}} openProduct={()=>{}} saved={[]} bagQuantities={{}} save={()=>{}} add={()=>{}} />)
  fireEvent.click(screen.getByRole("button",{name:/filter/i}))
  fireEvent.change(screen.getByRole("slider",{name:"Minimum price"}),{target:{value:"10000"}})
  fireEvent.change(screen.getByRole("slider",{name:"Maximum price"}),{target:{value:"30000"}})
  expect(screen.getByText("Piece 15000")).toBeTruthy()
  expect(screen.queryByText("Piece 1000")).toBeNull()
  expect(screen.queryByText("Piece 75000")).toBeNull()
  fireEvent.click(screen.getByRole("button",{name:"Reset"}))
  expect(screen.getByText("Piece 1000")).toBeTruthy()
  expect(screen.getByText("Piece 75000")).toBeTruthy()
})
