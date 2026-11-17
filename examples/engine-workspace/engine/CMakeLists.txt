add_library(engine INTERFACE)
target_include_directories(engine INTERFACE ${CMAKE_CURRENT_SOURCE_DIR})
target_compile_features(engine INTERFACE cxx_std_17)
target_sources(engine INTERFACE ${CMAKE_CURRENT_SOURCE_DIR}/SceneManager.hpp ${CMAKE_CURRENT_SOURCE_DIR}/RenderContext.hpp)
